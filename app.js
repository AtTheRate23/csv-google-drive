const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const { parse } = require('json2csv');
const cron = require('node-cron');
const { google } = require('googleapis');
const path = require('path');

mongoose.connect('mongodb+srv://audiopitara:83r593yTtqPE91L7@cluster0.1yxqn2q.mongodb.net/repline', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const CandidateSchema = new mongoose.Schema({
  candidate_id: String,
  employee_id: String,
  first_name: String,
  last_name: String,
});

const Candidate = mongoose.model('Candidate', CandidateSchema);

const app = express();

app.use(bodyParser.json());

// Load service account credentials
// const SERVICE_ACCOUNT_FILE = './gen-lang-client-0198426179-4fdb77cc43fc.json';

// Authenticate using the service account
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

async function uploadFileToDrive(filePath) {
  const folderId = '1Z3hySfq5OnWA4GfqIG2_cEtfOWjgnZPc'; // The ID of the folder where you want to upload the file
  const fileName = path.basename(filePath);

  try {
    // Check if the file already exists in the folder
    const listResponse = await drive.files.list({
      q: `name = '${fileName}' and '${folderId}' in parents`,
      fields: 'files(id, name)',
    });

    const existingFile = listResponse.data.files.find(file => file.name === fileName);

    if (existingFile) {
      // File exists, so update it
      await drive.files.update({
        fileId: existingFile.id,
        media: {
          mimeType: 'application/vnd.ms-excel',
          body: fs.createReadStream(filePath),
        },
      });
      console.log('File updated on Drive with ID:', existingFile.id);
    } else {
      // File does not exist, so create a new one
      const fileMetadata = {
        name: fileName,
        mimeType: 'application/vnd.ms-excel',
        parents: [folderId],
      };

      const media = {
        mimeType: 'application/vnd.ms-excel',
        body: fs.createReadStream(filePath),
      };

      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
      });
      console.log('File uploaded to Drive with ID:', response.data.id);
    }
  } catch (error) {
    console.error('Error uploading file to Drive:', error);
  }
}

app.post('/webhook', async (req, res) => {
  try {
    const requestData = req.body;
    const {
      candidate_id,
      employee_id,
      first_name,
      last_name,
      Insert_Order,
      employee_nicename,
      employee_display_name,
      employee_email,
      employer_nicename,
      employer_display_name,
      interview_status,
      date_created
    } = requestData;

    // Save candidate data to the database
    const newCandidate = new Candidate({
      candidate_id: candidate_id,
      employee_id: employee_id,
      first_name: first_name,
      last_name: last_name,
    });

    await newCandidate.save();

    // Prepare CSV data
    const csvData = {
      Insert_Order,
      employee_nicename,
      employee_display_name,
      employee_email,
      employer_nicename,
      employer_display_name,
      interview_status,
      date_created
    };

    const csvFilePath = 'interview_data.csv';

    // Check if file exists to determine whether to include the header
    const csvExists = fs.existsSync(csvFilePath);
    const csv = parse([csvData], { header: !csvExists });

    // Append or create the CSV file
    if (csvExists) {
      fs.appendFileSync(csvFilePath, `\n${csv}`);
    } else {
      fs.writeFileSync(csvFilePath, csv);
    }

    // Upload the file to Google Drive
    await uploadFileToDrive(csvFilePath);

    res.status(200).json({ status: 200, message: 'Data inserted successfully and CSV updated' });
  } catch (err) {
    console.error('Error inserting data:', err);
    res.status(500).send('Error inserting data');
  }
});

app.get('/fetchCandidates', async (req, res) => {
  try {
    const candidates = await Candidate.find({});
    const employeeCandidatesMap = {};

    // Group candidates by employee_id
    candidates.forEach(candidate => {
      if (!employeeCandidatesMap[candidate.employee_id]) {
        employeeCandidatesMap[candidate.employee_id] = [];
      }

      const candidateName = `${candidate.first_name} ${candidate.last_name}`;
      console.log(candidateName);
      employeeCandidatesMap[candidate.employee_id].push({
        name: candidateName,
        candidate_id: candidate.candidate_id,
      });
    });

    // Send separate emails for each employee_id
    for (const employee_id in employeeCandidatesMap) {
      const candidatesList = employeeCandidatesMap[employee_id].map((candidate, index) => `${index + 1}. ${candidate.name} : ${candidate.candidate_id}`).join('\n');

      // Implement logic to format the email content with the data
      const emailContent = `${employee_id} requests interviews with these reps:\n${candidatesList}\n`;

      // Configuration for email
      const emailConfig = {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: 'team@replineup.com', // Replace with the sender's email
          pass: 'uosoizozifiiozln', // Replace with the sender's email password or an app password
        },
      };

      // Create a Nodemailer transporter using the email configuration
      const transporter = nodemailer.createTransport(emailConfig);

      const mailOptions = {
        from: 'admin@prymedigital.com', // Replace with the sender's email
        to: ['team@replineup.com', 'jake@replineup.com', 'admin@prymedigital.com'], // Add more recipients if needed
        subject: 'Interview Request',
        text: emailContent,
      };

      // // Send the email using the transporter
      // transporter.sendMail(mailOptions, (error, info) => {
      //   if (error) {
      //     console.error('Error sending email:', error);
      //   } else {
      //     console.log('Email sent:', info.response);
      //   }
      // });
    }

    // Clear the Candidate collection after sending emails
    await Candidate.deleteMany({});

    res.status(200).json({ status: 200, message: 'Interview request emails sent successfully, and collection cleared.' });
  } catch (err) {
    console.error('Error fetching candidates:', err);
    res.status(500).json({ error: 'Error fetching candidates' });
  }
});

cron.schedule('*/60 * * * * *', async () => {
  try {
    // Make a GET request to your own server's /fetchCandidates endpoint
    const response = await axios.get('http://localhost:4000/fetchCandidates');
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
