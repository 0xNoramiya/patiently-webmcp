"""In-process pub/sub used to fan out queue and intake updates over SSE.

We keep one asyncio.Queue per subscriber, partitioned by topic (poli code or
"dashboard"). Producers call publish() after committing state changes.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, topic: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._subscribers[topic].add(q)
        return q

    async def unsubscribe(self, topic: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            self._subscribers[topic].discard(queue)

    async def publish(self, topic: str, event_type: str, payload: dict[str, Any]) -> None:
        message = {"type": event_type, "data": payload}
        encoded = json.dumps(message, default=str)
        for q in list(self._subscribers.get(topic, set())):
            try:
                q.put_nowait(encoded)
            except asyncio.QueueFull:
                pass

    async def publish_many(
        self, topics: list[str], event_type: str, payload: dict[str, Any]
    ) -> None:
        for t in topics:
            await self.publish(t, event_type, payload)


bus = EventBus()
