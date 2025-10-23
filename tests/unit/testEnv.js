const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env');
console.log("Looking for .env at:", envPath);

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    console.log("Contents of .env file:");
    console.log(envContent);
} catch (error) {
    console.error("Error reading .env file:", error.message);
}

require('dotenv').config();
console.log("Loaded via dotenv - OPENAI_API_KEY:", process.env.OPENAI_API_KEY || "Not loaded");
console.log("Loaded via dotenv - JWT_SECRET:", process.env.JWT_SECRET || "Not loaded");