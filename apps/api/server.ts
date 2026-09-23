import express from 'express';
const app = express();

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
    })
})

app.listen(3000, () => {
    console.log("server started at 3000")
})