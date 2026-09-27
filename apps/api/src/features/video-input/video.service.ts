import { google } from 'googleapis';
import path from 'path';
import axios from 'axios';

const keyPath = path.resolve(import.meta.dirname, '../../../secrets/project-68276a57-fc72-492d-a15-31d0fa8e3d89.json');
console.log(keyPath)
const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/drive'], // wrong use of scope earlier
});

export async function getResumeableUploadURL(file: { mimeType: string, fileSize: string, fileName: string }): Promise<string | undefined> {
    try {
        const authClient = await auth.getClient();
        console.log("client: ", authClient)
        const tokenResponse = await authClient.getAccessToken();
        if (!tokenResponse.token) {
            throw new Error("Failed to get access token");
        }
        console.log('token received: ', tokenResponse.token)
        const metadata = {
            name: file.fileName,
            mimeType: file.mimeType,
        }
        const res = await axios.post('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', JSON.stringify(metadata), {
            headers: {
                'Authorization': `Bearer ${tokenResponse.token}`,
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