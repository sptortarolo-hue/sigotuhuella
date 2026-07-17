#!/bin/bash
MODEL_DIR="server/models"
MODEL_URL="https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.onnx"
MODEL_FILE="$MODEL_DIR/yolov8n.onnx"

mkdir -p "$MODEL_DIR"

if [ -f "$MODEL_FILE" ]; then
  echo "[YOLO] Model already exists at $MODEL_FILE ($(du -h "$MODEL_FILE" | cut -f1))"
  exit 0
fi

echo "[YOLO] Downloading YOLOv8n ONNX model..."
curl -L "$MODEL_URL" -o "$MODEL_FILE"

if [ $? -eq 0 ] && [ -f "$MODEL_FILE" ]; then
  echo "[YOLO] Download complete: $MODEL_FILE ($(du -h "$MODEL_FILE" | cut -f1))"
else
  echo "[YOLO] Download failed"
  exit 1
fi
