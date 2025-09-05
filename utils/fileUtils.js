const fs = require('fs').promises;
const path = require('path');

const createUploadsDir = async () => {
  try {
    await fs.access(path.join(__dirname, '../uploads'));
  } catch {
    await fs.mkdir(path.join(__dirname, '../uploads'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../uploads/expenses'), { recursive: true });
  }
};

const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    console.log(`File deleted: ${filePath}`);
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error.message);
  }
};

const deleteFiles = async (files) => {
  if (files && Array.isArray(files)) {
    for (const file of files) {
      await deleteFile(file.path);
    }
  }
};

module.exports = {
  createUploadsDir,
  deleteFile,
  deleteFiles
};