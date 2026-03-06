/**
 * faceAuth.ts — Real face recognition using face-api.js
 * Uses TinyFaceDetector + FaceLandmark68TinyNet + FaceRecognitionNet
 * to extract 128-dim face descriptors from the webcam video element.
 */

import * as faceapi from 'face-api.js';

let modelsLoaded = false;

export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;
    const MODEL_URL = '/models';
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log('[FaceAuth] Models loaded');
}

/**
 * Detects a face in a video element and returns the 128-dim descriptor.
 * Returns null if no face is detected.
 */
export async function getFaceDescriptor(
    video: HTMLVideoElement
): Promise<Float32Array | null> {
    await loadFaceModels();

    const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5,
    });

    const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

    if (!detection) return null;
    return detection.descriptor;
}

/**
 * Takes multiple samples over N frames and averages them for a more stable descriptor.
 */
export async function captureAveragedDescriptor(
    video: HTMLVideoElement,
    samples = 5,
    onProgress?: (n: number) => void
): Promise<Float32Array | null> {
    await loadFaceModels();
    const descriptors: Float32Array[] = [];

    for (let i = 0; i < samples; i++) {
        await new Promise((r) => setTimeout(r, 200)); // short delay between frames
        const d = await getFaceDescriptor(video);
        if (d) {
            descriptors.push(d);
            onProgress?.(descriptors.length);
        }
    }

    if (descriptors.length === 0) return null;

    // Average the descriptors
    const avg = new Float32Array(128);
    for (const d of descriptors) {
        for (let i = 0; i < 128; i++) avg[i] += d[i];
    }
    for (let i = 0; i < 128; i++) avg[i] /= descriptors.length;
    return avg;
}

export function descriptorToArray(descriptor: Float32Array): number[] {
    return Array.from(descriptor);
}
