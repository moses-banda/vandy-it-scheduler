import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    logger.info(f"WebSocket connected: {user_id}")

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = data.get("event")

            # WebRTC signaling — relay between peers

            if event == "webrtc.offer":
                target = data.get("target_user_id")
                if target:
                    await manager.send_to_user(target, {
                        "event": "webrtc.offer",
                        "from_user_id": user_id,
                        "sdp": data.get("sdp"),
                        "call_id": data.get("call_id"),
                    })

            elif event == "webrtc.answer":
                target = data.get("target_user_id")
                if target:
                    await manager.send_to_user(target, {
                        "event": "webrtc.answer",
                        "from_user_id": user_id,
                        "sdp": data.get("sdp"),
                        "call_id": data.get("call_id"),
                    })

            elif event == "webrtc.ice_candidate":
                target = data.get("target_user_id")
                if target:
                    await manager.send_to_user(target, {
                        "event": "webrtc.ice_candidate",
                        "from_user_id": user_id,
                        "candidate": data.get("candidate"),
                        "call_id": data.get("call_id"),
                    })

            elif event == "heartbeat":
                await websocket.send_json({"event": "heartbeat_ack"})

            elif event == "call.declined":
                call_id = data.get("call_id")
                logger.info(f"Call declined via WS: {call_id} by {user_id}")
                await manager.broadcast({
                    "event": "call.declined",
                    "call_id": call_id,
                    "worker_id": user_id,
                })

            else:
                logger.debug(f"Unknown WS event from {user_id}: {event}")

    except WebSocketDisconnect:
        manager.disconnect(user_id)
        logger.info(f"WebSocket disconnected: {user_id}")
