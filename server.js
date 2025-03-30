// backend/server.js
// WARNING: This version uses execSync, which BLOCKS the server during conversion.
// It is NOT recommended for production or servers needing responsiveness.
// Use asynchronous methods (fluent-ffmpeg or spawn) for better performance.

import express from 'express';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';
// Import only execSync from child_process
import { execSync } from 'child_process';

// --- Basic Setup ---
// Replicate __dirname functionality in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Make sure port is defined correctly
const port = 3001; // Port for the backend server

// --- Middleware ---
// Enable CORS
app.use(cors({
    origin: 'http://localhost:5173' // Adjust to your frontend's actual origin/port
}));
// Parse JSON request bodies
app.use(express.json());

// --- Static File Serving for Downloads ---
const publicDownloadsDir = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(publicDownloadsDir)) {
    console.log(`[Backend] Creating downloads directory: ${publicDownloadsDir}`);
    fs.mkdirSync(publicDownloadsDir, { recursive: true });
} else {
    console.log(`[Backend] Downloads directory already exists: ${publicDownloadsDir}`);
}
// Serve files from '/public/downloads' directory under the '/downloads' route
app.use('/downloads', express.static(publicDownloadsDir));
console.log(`[Backend] Serving static downloads from route '/downloads' linked to directory: ${publicDownloadsDir}`);

// --- API Endpoint for Conversion (Using execSync - BLOCKING) ---
app.post('/api/convert-m3u8', (req, res) => {
    const m3u8Url = req.body.url;

    // Basic validation
    if (!m3u8Url || typeof m3u8Url !== 'string' || !m3u8Url.startsWith('http')) {
        console.log('[Backend] Invalid M3U8 URL received:', m3u8Url);
        // Send response immediately for invalid input
        return res.status(400).json({ success: false, message: 'Invalid or missing M3U8 URL in request body' });
    }

    // Generate unique filename and paths
    const outputFileName = `converted_${Date.now()}.mp4`;
    const outputPath = path.join(publicDownloadsDir, outputFileName); // Full path to save the file
    const publicDownloadUrl = `/downloads/${outputFileName}`; // Relative URL for frontend access

    console.log(`[Backend] Received request for: ${m3u8Url}`);
    console.log(`[Backend] Output path: ${outputPath}`);
    console.log(`[Backend] Using execSync (synchronous/blocking)...`);

    // --- FFmpeg Command Construction ---
    // Added essential options for HLS and MP4 compatibility + speed via copy
    const command = `ffmpeg -y -protocol_whitelist file,http,https,tcp,tls,crypto -i "${m3u8Url}" -bsf:a aac_adtstoasc -c copy "${outputPath}"`;
    console.log(`[Backend] Executing command: ${command}`);

    // --- Synchronous Execution Block ---
    // WARNING: The Node.js process will completely block here until FFmpeg finishes or throws an error.
    // The server WILL NOT RESPOND to any other requests during this time.
    try {
        // Execute FFmpeg synchronously
        execSync(command, { stdio: 'inherit' }); // 'inherit' shows FFmpeg output in this console

        // If execSync completes without throwing, FFmpeg likely succeeded (exit code 0)
        console.log(`[Backend] execSync finished successfully for: ${outputPath}`);
        // Send success response ONLY AFTER execSync is done
        res.json({ success: true, downloadUrl: publicDownloadUrl });

    } catch (error) {
        // This block executes if FFmpeg returns a non-zero exit code
        console.error(`[Backend] Error executing FFmpeg with execSync: ${error.message}`);
        console.error(`[Backend] FFmpeg likely failed. Check output above for FFmpeg errors.`);

        // Attempt to delete the partially created file, if it exists
        try {
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
                console.log(`[Backend] Deleted incomplete file on error: ${outputPath}`);
            }
        } catch (e) {
            console.error(`[Backend] Error deleting incomplete file: ${e.message}`);
        }

        // Send error response ONLY AFTER execSync has failed
        // Avoid ERR_HTTP_HEADERS_SENT by ensuring response is sent only once
        if (!res.headersSent) {
             res.status(500).json({ success: false, message: `FFmpeg conversion failed (execSync). Check backend logs.` });
        }
    }
    // --- End Synchronous Execution Block ---
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`[Backend] Server listening on http://localhost:${port}`);
});