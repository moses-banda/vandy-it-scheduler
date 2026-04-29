import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select, and_

from app.db.session import AsyncSessionLocal
from app.db.models.shift import Shift
from app.db.models.dispatch import Dispatch
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

DISPATCH_TIMEOUT_SECONDS = 30
SHIFT_END_WARNING_MINUTES = 10


async def auto_checkout_job():
    logger.info("Running auto checkout job...")
    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(timezone.utc)

            result = await db.execute(
                select(Shift)
                .where(
                    and_(
                        Shift.status == "checked_in",
                        Shift.end_time <= now,
                    )
                )
                .with_for_update(skip_locked=True)
            )
            shifts = result.scalars().all()

            for shift in shifts:
                shift.status = "completed"
                logger.info(f"Auto checkout: shift {shift.id} worker {shift.worker_id}")

            if shifts:
                await db.commit()
                logger.info(f"Auto checked out {len(shifts)} shift(s).")
                for shift in shifts:
                    await manager.broadcast({
                        "event": "shift.auto_checkout",
                        "shift_id": shift.id,
                        "worker_id": shift.worker_id,
                    })

        except Exception as e:
            logger.error(f"Auto checkout error: {e}")
            await db.rollback()


async def missed_checkin_job():
    logger.info("Running missed check-in detection...")
    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(timezone.utc)

            result = await db.execute(
                select(Shift)
                .where(
                    and_(
                        Shift.status == "scheduled",
                        Shift.checkin_close_time != None,  # noqa: E711
                        Shift.checkin_close_time <= now,
                    )
                )
                .with_for_update(skip_locked=True)
            )
            shifts = result.scalars().all()

            for shift in shifts:
                shift.status = "missed"
                logger.info(f"Missed check-in: shift {shift.id} worker {shift.worker_id}")

            if shifts:
                await db.commit()
                logger.info(f"Marked {len(shifts)} shift(s) as missed.")
                for shift in shifts:
                    await manager.broadcast({
                        "event": "checkin.missed",
                        "shift_id": shift.id,
                        "worker_id": shift.worker_id,
                    })

        except Exception as e:
            logger.error(f"Missed check-in error: {e}")
            await db.rollback()


async def dispatch_timeout_job():
    logger.info("Running dispatch timeout check...")
    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(timezone.utc)

            result = await db.execute(
                select(Dispatch)
                .where(
                    and_(
                        Dispatch.status == "ringing",
                        Dispatch.ringing_at != None,  # noqa: E711
                    )
                )
                .with_for_update(skip_locked=True)
            )
            dispatches = result.scalars().all()

            timed_out = []
            for dispatch in dispatches:
                elapsed = (now - dispatch.ringing_at).total_seconds()

                if elapsed >= DISPATCH_TIMEOUT_SECONDS:
                    dispatch.status = "missed"
                    dispatch.responded_at = now
                    timed_out.append(dispatch)

                    logger.info(
                        f"Dispatch timeout: {dispatch.id} "
                        f"worker {dispatch.assigned_worker_id} "
                        f"({elapsed:.0f}s elapsed)"
                    )

            if timed_out:
                await db.commit()

                for dispatch in timed_out:
                    await manager.send_to_user(
                        dispatch.assigned_worker_id,
                        {
                            "event": "dispatch.missed",
                            "dispatch_id": dispatch.id,
                            "message": "Dispatch timed out.",
                        },
                    )

                    await manager.broadcast({
                        "event": "dispatch.status_changed",
                        "dispatch_id": dispatch.id,
                        "status": "missed",
                        "assigned_worker_id": dispatch.assigned_worker_id,
                    })

        except Exception as e:
            logger.error(f"Dispatch timeout error: {e}")
            await db.rollback()


async def shift_end_warning_job():
    logger.info("Running shift end warning check...")
    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(timezone.utc)

            result = await db.execute(
                select(Shift).where(
                    and_(
                        Shift.status == "checked_in",
                        Shift.end_time > now,
                    )
                )
            )
            shifts = result.scalars().all()

            for shift in shifts:
                remaining = (shift.end_time - now).total_seconds()
                warning_threshold = SHIFT_END_WARNING_MINUTES * 60

                if 0 < remaining <= warning_threshold:
                    minutes_left = int(remaining / 60)

                    await manager.send_to_user(
                        shift.worker_id,
                        {
                            "event": "shift.ending_soon",
                            "shift_id": shift.id,
                            "minutes_remaining": minutes_left,
                            "message": f"Your shift ends in {minutes_left} minute(s).",
                        },
                    )

                    logger.info(
                        f"Shift end warning: {shift.id} "
                        f"worker {shift.worker_id} "
                        f"{minutes_left}min remaining"
                    )

        except Exception as e:
            logger.error(f"Shift end warning error: {e}")


def start_scheduler():
    scheduler.add_job(
        auto_checkout_job,
        trigger=IntervalTrigger(seconds=60),
        id="auto_checkout",
        name="Auto checkout expired shifts",
        replace_existing=True,
    )

    scheduler.add_job(
        missed_checkin_job,
        trigger=IntervalTrigger(seconds=60),
        id="missed_checkin",
        name="Detect missed check-ins",
        replace_existing=True,
    )

    scheduler.add_job(
        dispatch_timeout_job,
        trigger=IntervalTrigger(seconds=30),
        id="dispatch_timeout",
        name="Timeout unanswered dispatches",
        replace_existing=True,
    )

    scheduler.add_job(
        shift_end_warning_job,
        trigger=IntervalTrigger(seconds=60),
        id="shift_end_warning",
        name="Warn workers before shift ends",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with 4 jobs.")


def stop_scheduler():
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped.")
