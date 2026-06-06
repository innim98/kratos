import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { authenticateAny } from '../lib/auth.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WHISPER_BIN = path.resolve(__dirname, '../bin/whisper-cli');
const WHISPER_MODEL = path.resolve(__dirname, '../models/ggml-base.bin');
const VOICE_TMP = '/tmp/kratos-voice';

function getTmuxCwd(sessionName) {
  try {
    return execSync(
      `tmux display-message -t ${sessionName} -p '#{pane_current_path}'`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
  } catch { return null; }
}

export default async function voiceRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  fs.mkdirSync(VOICE_TMP, { recursive: true });

  // STT: upload audio → whisper → text → tmux input
  app.post('/api/agents/:id/voice', { preHandler: auth }, async (request, reply) => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(request.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const parts = request.parts();
    let audioPath = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const ext = path.extname(part.filename) || '.mp3';
        audioPath = path.join(VOICE_TMP, `${Date.now()}${ext}`);
        const { pipeline } = await import('stream/promises');
        await pipeline(part.file, fs.createWriteStream(audioPath));
      }
    }

    if (!audioPath) return reply.code(400).send({ error: 'No audio file' });

    // Convert to wav if needed (whisper-cli supports mp3 directly)
    const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
    try {
      execSync(`ffmpeg -i ${audioPath} -ar 16000 -ac 1 -c:a pcm_s16le ${wavPath} -y 2>/dev/null`, { timeout: 30000 });
    } catch {
      // Try using the file directly if ffmpeg not available
    }

    const inputFile = fs.existsSync(wavPath) ? wavPath : audioPath;

    // Run whisper
    let text = '';
    try {
      const output = execSync(
        `${WHISPER_BIN} -m ${WHISPER_MODEL} -f ${inputFile} -l ko --no-timestamps -otxt 2>/dev/null && cat ${inputFile}.txt`,
        { encoding: 'utf8', timeout: 120000 }
      );
      text = output.trim();
    } catch (e) {
      // Cleanup
      try { fs.unlinkSync(audioPath); } catch {}
      try { fs.unlinkSync(wavPath); } catch {}
      try { fs.unlinkSync(inputFile + '.txt'); } catch {}
      return reply.code(500).send({ error: 'Whisper failed: ' + e.message });
    }

    // Cleanup temp files
    try { fs.unlinkSync(audioPath); } catch {}
    try { fs.unlinkSync(wavPath); } catch {}
    try { fs.unlinkSync(inputFile + '.txt'); } catch {}

    if (!text) return reply.code(400).send({ error: 'No speech detected' });

    // Send to tmux
    const port = process.env.PORT || 15001;
    const voiceReplyCmd = `# 음성응답: curl -X POST http://localhost:${port}/api/agents/${agent.id}/voice/speak -H "Authorization: Bearer ${agent.token}" -H "Content-Type: application/json" -d '{"text":"<REPLY>"}'`;

    const lines = [text, voiceReplyCmd];
    for (const line of lines) {
      try {
        execSync(`tmux send-keys -t ${agent.tmux_session} ${JSON.stringify(line)}`, { timeout: 3000 });
        execSync(`tmux send-keys -t ${agent.tmux_session} Enter`, { timeout: 3000 });
        execSync(`tmux send-keys -t ${agent.tmux_session} Enter`, { timeout: 3000 });
      } catch {}
    }

    return { text, agentId: agent.id };
  });

  // TTS: agent sends text → WS broadcast → browser plays
  app.post('/api/agents/:id/voice/speak', { preHandler: auth }, async (request, reply) => {
    const agentId = Number(request.params.id);
    const { text } = request.body || {};
    if (!text) return reply.code(400).send({ error: 'text required' });

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    // Broadcast to all WS clients
    const wsData = JSON.stringify({ type: 'voice-speak', agentId, text, agentName: agent.name });
    for (const client of app.websocketServer?.clients || []) {
      if (client.readyState === 1) {
        try { client.send(wsData); } catch {}
      }
    }

    return { ok: true };
  });
}
