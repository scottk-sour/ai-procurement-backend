// middleware/csvUpload.js
import multer from "multer";
import path from "path";
import fs from "fs";

// Define upload path
const uploadPath = "uploads/vendors/others/";
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Set up Multer disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^\w.-]/g, "_").slice(0, 50);
    const uniqueFilename = `${Date.now()}-${sanitized}`;
    cb(null, uniqueFilename);
  },
});

// Filter to allow only CSV files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "text/csv") {
    cb(null, true);
  } else {
    cb(new Error("Only CSV files are allowed"), false);
  }
};

// Export configured Multer middleware
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
});

export default upload;
