import dotenv from 'dotenv';
dotenv.config();
import { google } from 'googleapis';
import path from 'path';
import axios from 'axios';

const folderID = process.env.FOLDER_ID;
const YOUR_CLIENT_ID = process.env.YOUR_CLIENT_ID;
const YOUR_CLIENT_SECRET = process.env.YOUR_CLIENT_SECRET;
const STATIC_REDIRECT_URI = process.env.STATIC_REDIRECT_URI;
const YOUR_REFRESH_TOKEN = process.env.YOUR_REFRESH_TOKEN;

console.log(folderID)
const keyPath = path.resolve(import.meta.dirname, '../../../secrets/project-68276a57-fc72-492d-a15-31d0fa8e3d89.json');
console.log(keyPath)

// 1. Initialize the OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
    YOUR_CLIENT_ID,
    YOUR_CLIENT_SECRET,
    STATIC_REDIRECT_URI
);

oauth2Client.setCredentials({
    refresh_token: YOUR_REFRESH_TOKEN
});

export async function getResumeableUploadURL(file: { mimeType: string, fileSize: string, fileName: string }): Promise<string | undefined> {
    if (!folderID) {
        console.log("folderid is undefined: ", folderID);
        process.exit(0);
    }
    try {
        const { token: accessToken } = await oauth2Client.getAccessToken();
        const metadata: { name: string, mimeType: string, parents: string[] } = {
            name: file.fileName,
            mimeType: file.mimeType,
            parents: [folderID],
        }
        const res = await axios.post('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', JSON.stringify(metadata), {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': file.mimeType,
                'X-Upload-Content-Length': file.fileSize,
            }
        })
        return res.headers.location;
    } catch (error: any) {
        console.error("ERROR:");

        console.error({
            name: error.name,
            message: error.message,
            responseStatus: error.response?.status,
            responseData: error.response?.data,
        });
        return undefined;
    }
}