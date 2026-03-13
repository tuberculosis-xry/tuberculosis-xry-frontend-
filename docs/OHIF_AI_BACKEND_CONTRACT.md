# OHIF AI Inference — Backend Contract

This document describes the request/response contract between the custom OHIF viewer (Dashboard → OHIF → Viewer → **Run AI**) and an external AI inference service. The frontend uses `NEXT_PUBLIC_OHIF_AI_API_URL` as the base URL.

## Environment

- **`NEXT_PUBLIC_OHIF_AI_API_URL`**  
  Base URL of the AI service (e.g. `https://your-ai-service`). No trailing slash. If unset, "Run AI" returns a friendly message in the panel instead of calling the network.

## Endpoint

- **Method:** `POST`
- **Path:** `{NEXT_PUBLIC_OHIF_AI_API_URL}/infer`
- **Headers:** `Content-Type: application/json`

## Request Body (JSON)

| Field               | Type   | Required | Description                                      |
|---------------------|--------|----------|--------------------------------------------------|
| `studyInstanceUID`  | string | No       | DICOM Study Instance UID                         |
| `seriesInstanceUID`| string | No       | DICOM Series Instance UID                        |
| `instanceId`        | string | No       | SOP Instance UID                                 |
| `viewportIndex`     | number | No       | Active viewport index (0-based)                  |
| `task`              | string | No       | Optional model/task selector (backend-defined)   |

Example:

```json
{
  "studyInstanceUID": "1.2.3.4.5",
  "seriesInstanceUID": "1.2.3.4.5-series-1",
  "viewportIndex": 0
}
```

## Response (200 OK)

| Field     | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `report`  | string | No       | Plain text or markdown for the AI Results panel  |
| `overlays`| object | No       | Optional overlay data (format backend-specific; e.g. segments, boxes) for future viewport overlay |

Example (text only):

```json
{
  "report": "Findings: No significant abnormality detected in the current series."
}
```

Example (with optional overlay placeholder):

```json
{
  "report": "Segmentation complete.",
  "overlays": {}
}
```

## Error Handling

- **4xx / 5xx:** Frontend shows the error in the AI panel. It tries to read `message` or `error` from a JSON body, otherwise uses response status text or body as string.

## Overlay Contract (Future)

The viewer currently displays only `report` in the panel. If the backend returns `overlays`, the format is left to the backend (e.g. segmentation masks, bounding boxes). A future viewer update may consume `overlays` to render annotations in the viewport; the backend can already include this field for forward compatibility.
