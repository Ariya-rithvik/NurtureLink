// Native MediaRecorder + camera helpers — no external dependencies.

export type AudioRecording = {
  blob: Blob;
  mime: string;
  durationMs: number;
};

export type RecorderController = {
  stop: () => Promise<AudioRecording>;
  cancel: () => void;
  stream: MediaStream;
};

/** Start recording from the default microphone. Caller decides when to stop. */
export async function startAudioRecording(): Promise<RecorderController> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  const mimeType =
    candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const startedAt = performance.now();
  rec.start();

  let resolved = false;

  const stop = (): Promise<AudioRecording> =>
    new Promise((resolve, reject) => {
      if (resolved) {
        reject(new Error('Recorder already stopped.'));
        return;
      }
      rec.onstop = () => {
        resolved = true;
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        resolve({
          blob,
          mime: rec.mimeType || 'audio/webm',
          durationMs: performance.now() - startedAt,
        });
      };
      rec.onerror = (e) => {
        resolved = true;
        stream.getTracks().forEach((t) => t.stop());
        reject(e);
      };
      try {
        rec.stop();
      } catch (e) {
        reject(e);
      }
    });

  const cancel = () => {
    if (!resolved) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      resolved = true;
      stream.getTracks().forEach((t) => t.stop());
    }
  };

  return { stop, cancel, stream };
}

// -------- Camera helpers --------

export type CameraStream = {
  stream: MediaStream;
  stop: () => void;
};

export async function startCamera(
  facingMode: 'user' | 'environment' = 'user',
): Promise<CameraStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is not supported in this browser.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  const stop = () => stream.getTracks().forEach((t) => t.stop());
  return { stream, stop };
}

export type CapturedFrame = {
  blob: Blob;
  dataUrl: string;
};

/** Grab a single frame from a <video> element as a JPEG blob + data URL. */
export async function captureFrame(
  video: HTMLVideoElement,
  maxWidth = 720,
): Promise<CapturedFrame> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('Camera is not ready yet.');
  }
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(video, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed.'))),
      'image/jpeg',
      0.85,
    );
  });

  return { blob, dataUrl };
}
