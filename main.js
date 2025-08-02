import { AgentProcess } from './src/process/agent-process.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = __dirname;

const logFile = path.join(path.join(appPath, 'userData'), 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

function notifyBotKicked() {
    logToFile("Bot was kicked");
}

function startServer() {
    logToFile("Starting server...");
    const userDataDir = path.join(appPath, 'userData');
    if (!userDataDir || !fs.existsSync(userDataDir)) {
        throw new Error("userDataDir must be provided and must exist");
    }

    const settingsPath = path.join(userDataDir, 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

    settings.allow_insecure_coding = false;
    settings.code_timeout_mins = 10;
    settings.auth = "offline";

    const profiles = settings.profiles;
    const load_memory = settings.load_memory;
    const openai_api_key = settings.openai_api_key;
    
    const app = express();
    const port = 10101;
    const server = http.createServer(app);

    let agentProcesses = [];
    let agentProcessStarted = false;

    for (let profile of profiles) {
        const profileBotName = profile.name;
        const agentProcess = new AgentProcess(notifyBotKicked, appPath);
        agentProcess.start(profileBotName, userDataDir, openai_api_key, load_memory);
        agentProcesses.push(agentProcess);
    }

    agentProcessStarted = true;

    logToFile('API: Settings updated and AgentProcess started for all profiles');
    const shutdown = () => {
        logToFile('Shutting down gracefully...');
        if (agentProcessStarted) {
            agentProcesses.forEach(agentProcess => {
                agentProcess.agentProcess.kill('SIGTERM');
            });
            agentProcesses = [];
            agentProcessStarted = false;
        }
        server.close(() => {
            logToFile('HTTP server closed');
            process.exit(0);
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    server.listen(port, '127.0.0.1', () => {
        logToFile(`Server running at http://127.0.0.1:${port}`);
    });

    logToFile("Server started successfully.");
}

try {
    startServer();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}