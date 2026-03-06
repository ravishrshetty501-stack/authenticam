New-Item -ItemType Directory -Force -Path "public\models" | Out-Null
$base = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/"
$files = @(
    "tiny_face_detector_model-weights_manifest.json",
    "tiny_face_detector_model-shard1",
    "face_landmark_68_tiny_model-weights_manifest.json",
    "face_landmark_68_tiny_model-shard1",
    "face_recognition_model-weights_manifest.json",
    "face_recognition_model-shard1",
    "face_recognition_model-shard2"
)
foreach ($f in $files) {
    Write-Host "Downloading $f..."
    Invoke-WebRequest -Uri ($base + $f) -OutFile ("public\models\" + $f) -UseBasicParsing
}
Write-Host "All models downloaded!"
