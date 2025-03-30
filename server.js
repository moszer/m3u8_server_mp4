// backend/server.js
// Version suitable for Vercel deployment using fluent-ffmpeg and ffmpeg-static.
// CORS is set to Allow All Origins (use with caution in production).

import express from 'express';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';

import ffmpeg from 'fluent-ffmpeg';         // The fluent wrapper
import ffmpegStatic from 'ffmpeg-static';    // Provides the path to the static binary

// --- Crucial for Vercel ---
// Tell fluent-ffmpeg where to find the static FFmpeg binary provided by ffmpeg-static
ffmpeg.setFfmpegPath(ffmpegStatic);
console.log(`[Backend] Using FFmpeg binary path: ${ffmpegStatic}`);

// --- Basic Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
// Vercel automatically sets the PORT environment variable. Use it if available.
const port = process.env.PORT || 3001;

// --- Middleware ---
// Enable CORS - Allow requests from ANY origin (Allow All)
// WARNING: For production, it's safer to restrict the origin!
app.use(cors()); // <--- แก้ไขตรงนี้เป็น Allow All
console.log('[Backend] CORS enabled for all origins.');
// Parse JSON request bodies
app.use(express.json());

// --- Output Directory ---
// Vercel serverless functions can only write to /tmp
const outputDir = '/tmp';
console.log(`[Backend] Using temporary output directory: ${outputDir}`);
// NOTE: We cannot statically serve files from /tmp on Vercel serverless.
// Output files need to be uploaded to cloud storage (Blob, S3, etc.) to be downloadable.

// --- API Endpoint for Conversion ---
app.post('/api/convert-m3u8', (req, res) => {
    const m3u8Url = req.body.url;
    let responseSent = false; // Flag to prevent double responses

    if (!m3u8Url || typeof m3u8Url !== 'string' || !m3u8Url.startsWith('http')) {
        console.log('[Backend] Invalid M3U8 URL received:', m3u8Url);
        return res.status(400).json({ success: false, message: 'Invalid or missing M3U8 URL' });
    }

    // Use /tmp directory for output on Vercel
    const outputFileName = `converted_${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);

    console.log(`[Backend] Received request for: ${m3u8Url}`);
    console.log(`[Backend] Temporary output path: ${outputPath}`);

    try {
        ffmpeg(m3u8Url, { timeout: 432000 }) // Consider Vercel's function timeout limits (default can be short)
            .inputOptions(['-protocol_whitelist', 'file,http,https,tcp,tls,crypto'])
            .outputOptions(['-bsf:a', 'aac_adtstoasc', '-c', 'copy']) // Attempt codec copy
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`[FFmpeg] Processing: ${Math.floor(progress.percent)}% done`);
                }
            })
            .on('error', (err, stdout, stderr) => {
                if (responseSent) return;
                responseSent = true;
                console.error('[Backend] FFmpeg error:', err.message);
                console.error('[Backend] FFmpeg stderr:', stderr || 'Not available');
                // Attempt to delete temp file on error
                try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { console.error(`Error deleting tmp file: ${e.message}`);}
                res.status(500).json({ success: false, message: `FFmpeg conversion failed: ${err.message}` });
            })
            .on('end', (stdout, stderr) => {
                if (responseSent) return;
                responseSent = true;
                console.log(`[Backend] Conversion finished successfully to tmp path: ${outputPath}`);
                console.log(`[Backend] NOTE: File saved to temporary storage. Needs upload step for download.`);

                // In a real Vercel app: Upload `outputPath` to cloud storage here.
                // For now, just send success message.
                res.json({
                    success: true,
                    message: "Conversion successful (file in temporary storage).",
                    downloadUrl: null // Cannot provide direct download from /tmp
                 });

                // Optional: Clean up the temp file later
                // setTimeout(() => { try { fs.unlinkSync(outputPath); console.log(`[Backend] Cleaned up tmp file: ${outputPath}`); } catch(e){} }, 60000);
            })
            .save(outputPath); // Save to /tmp

    } catch (error) {
        if (!responseSent) {
            responseSent = true;
            console.error('[Backend] Error setting up FFmpeg command:', error);
            res.status(500).json({ success: false, message: `Server error setting up conversion: ${error.message}` });
        }
    }
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`[Backend] Server listening on port ${process.env.PORT || 3001}`);
});