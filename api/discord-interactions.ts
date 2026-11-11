import { createPublicKey, verify } from 'node:crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY;
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  // Discord public keys are 32 bytes (64 hexadecimal characters).
  if (!publicKeyHex || !/^[a-f0-9]{64}$/i.test(publicKeyHex)) {
    console.error('DISCORD_PUBLIC_KEY is missing or invalid.');
    return res.status(500).json({ error: 'Interaction endpoint is not configured.' });
  }

  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature) ||
      typeof timestamp !== 'string') {
    return res.status(401).json({ error: 'Invalid request signature.' });
  }

  try {
    const rawBody = await readRawBody(req);
    const keyDer = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(publicKeyHex, 'hex'),
    ]);
    const publicKey = createPublicKey({ key: keyDer, format: 'der', type: 'spki' });
    const valid = verify(
      null,
      Buffer.concat([Buffer.from(timestamp), rawBody]),
      publicKey,
      Buffer.from(signature, 'hex'),
    );

    if (!valid) {
      return res.status(401).json({ error: 'Invalid request signature.' });
    }

    const interaction = JSON.parse(rawBody.toString('utf8'));

    if (interaction.type === 1) {
      return res.status(200).json({ type: 1 });
    }

    if (
      interaction.type === 3 &&
      interaction.data?.custom_id === 'open_sterling_activity'
    ) {
      return res.status(200).json({ type: 12 });
    }

    return res.status(400).json({ error: 'Unsupported interaction.' });
  } catch (error) {
    console.error('Discord interaction handling failed:', error);
    return res.status(400).json({ error: 'Invalid interaction payload.' });
  }
}
