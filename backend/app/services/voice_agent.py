import os
import uuid
import wave
import logging

logger = logging.getLogger(__name__)

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "audio_cache")
os.makedirs(AUDIO_DIR, exist_ok=True)

VOICE_MODEL = "en_US-lessac-medium"
_voice = None


def get_voice():
    global _voice
    if _voice is None:
        from piper.voice import PiperVoice
        _voice = PiperVoice.load(VOICE_MODEL)
        logger.info(f"Piper voice loaded: {VOICE_MODEL}")
    return _voice


def generate_dispatch_message(building_name: str, issue_text: str) -> str:
    message = (
        f"You have a dispatch at {building_name}. "
        f"{issue_text}. "
        f"Are you available to take this?"
    )
    return message


def generate_audio(text: str) -> str:
    filename = f"dispatch_{uuid.uuid4().hex[:8]}.wav"
    filepath = os.path.join(AUDIO_DIR, filename)

    try:
        voice = get_voice()

        with wave.open(filepath, "wb") as wav_file:
            voice.synthesize(text, wav_file)

        logger.info(f"Audio generated: {filepath}")
        return filepath

    except Exception as e:
        logger.error(f"Piper TTS generation failed: {e}")
        return None


def cleanup_audio(filepath: str):
    try:
        if filepath and os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"Audio cleaned up: {filepath}")
    except Exception as e:
        logger.error(f"Audio cleanup failed: {e}")
