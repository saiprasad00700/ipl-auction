import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  ensureAnalyticsSession,
  heartbeatAnalyticsSession,
  trackAnalyticsEvent,
  endAnalyticsSession
} from '../lib/insights';

export default function InsightsTracker() {
  const location = useLocation();
  const previousRoomId = useRef(null);
  const previousPath = useRef('');

  useEffect(() => {
    let stopHeartbeat = null;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (stopHeartbeat) clearInterval(stopHeartbeat);
      stopHeartbeat = null;
      if (!user) return;
      void ensureAnalyticsSession();
      void trackAnalyticsEvent('page_view', null, { path: window.location.pathname || '/' });
      stopHeartbeat = setInterval(() => {
        void heartbeatAnalyticsSession();
      }, 60_000);
    });
    const handlePageHide = () => endAnalyticsSession();
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      unsubscribe();
      if (stopHeartbeat) clearInterval(stopHeartbeat);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  useEffect(() => {
    const path = location.pathname || '/';
    if (path === previousPath.current) return;
    const isInitialPath = previousPath.current === '';
    previousPath.current = path;
    if (isInitialPath) return;
    const match = path.match(/^\/(?:lobby|auction)\/([a-zA-Z0-9_-]{1,80})/);
    const nextRoomId = match ? match[1] : null;
    if (nextRoomId && nextRoomId !== previousRoomId.current) {
      if (previousRoomId.current) {
        void trackAnalyticsEvent('room_leave', previousRoomId.current);
      }
      previousRoomId.current = nextRoomId;
    } else if (!nextRoomId && previousRoomId.current) {
      void trackAnalyticsEvent('room_leave', previousRoomId.current);
      previousRoomId.current = null;
    }
    void trackAnalyticsEvent('page_view', null, { path });
  }, [location.pathname]);

  return null;
}
