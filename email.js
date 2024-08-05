const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

mongoose.connect('mongodb+srv://audiopitara:83r593yTtqPE91L7@cluster0.1yxqn2q.mongodb.net/repline', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const CandidateSchema = new mongoose.Schema({
  candidate_id: String,
  employee_id: String,
});

const Candidate = mongoose.model('Candidate', CandidateSchema);

const app = express();

app.use(bodyParser.json());

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

    res.status(200).json({ status: 200, message: 'Data inserted successfully and CSV updated' });
  } catch (err) {
    console.error('Error inserting data:', err);
    res.status(500).send('Error inserting data');
  }
});

app.get('/fetchCandidates', async (req, res) => {
  try {
    const candidates = await Candidate.find({});
    const formattedData = candidates.map((candidate, index) => `${index + 1}. Candidate ID: ${candidate.candidate_id}, Employee ID: ${candidate.employee_id}`).join('\n');

    // Implement logic to format the email content with the data
    const emailContent = `Interview request received for candidates:\n\n${formattedData}`;

    // Configuration for email
    const emailConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'admin@prymedigital.com', // Replace with the sender's email
        pass: 'rnzbbfxnknduhcdv', // Replace with the sender's email password or an app password
      },
    };

    // Create a Nodemailer transporter using the email configuration
    const transporter = nodemailer.createTransport(emailConfig);

    const mailOptions = {
      from: 'admin@prymedigital.com', // Replace with the sender's email
      to: 'priyaranjan.naxtre@gmail.com', // Replace with the recipient's email
      subject: 'Interview Request',
      text: emailContent,
    };

    // Send the email using the transporter
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        res.status(500).send('Error sending email');
      } else {
        console.log('Email sent:', info.response);
        res.status(200).json({ status: 200, message: 'Interview request email sent successfully' });
      }
    });
  } catch (err) {
    console.error('Error fetching candidates:', err);
    res.status(500).json({ error: 'Error fetching candidates' });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
