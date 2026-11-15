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
  const countryEstimate = (() => {
    try { return new Intl.Locale(navigator.language).region || null; } catch { return null; }
  })();

  useEffect(() => {
    let unsubscribe = null;
    let stopHeartbeat = null;
    const stopTracking = () => {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      if (stopHeartbeat) clearInterval(stopHeartbeat);
      stopHeartbeat = null;
      void endAnalyticsSession();
    };
    const startTracking = () => {
      if (localStorage.getItem('cookie_consent_status') !== 'accepted' || unsubscribe) return;
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (stopHeartbeat) clearInterval(stopHeartbeat);
        stopHeartbeat = null;
        if (!user) return;
        void ensureAnalyticsSession();
        void trackAnalyticsEvent('page_view', null, { path: window.location.pathname || '/', countryEstimate });
        stopHeartbeat = setInterval(() => {
          void heartbeatAnalyticsSession();
        }, 60_000);
      });
    };
    const handleConsent = (event) => {
      if (event.detail === 'accepted') startTracking();
      else stopTracking();
    };
    startTracking();
    window.addEventListener('ssauction-consent-updated', handleConsent);
    const handlePageHide = () => endAnalyticsSession();
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      stopTracking();
      window.removeEventListener('ssauction-consent-updated', handleConsent);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  useEffect(() => {
    if (localStorage.getItem('cookie_consent_status') !== 'accepted') return;
    const path = location.pathname || '/';
    if (path === previousPath.current) return;
    const isInitialPath = previousPath.current === '';
    previousPath.current = path;
    if (isInitialPath) return;
    const match = path.match(/^\/(?:lobby|auction)\/([a-zA-Z0-9_-]{1,80})/);
    const nextRoomId = match ? match[1] : null;
    if (nextRoomId && nextRoomId !== previousRoomId.current) {
      if (previousRoomId.current) void trackAnalyticsEvent('room_leave', previousRoomId.current);
      previousRoomId.current = nextRoomId;
    } else if (!nextRoomId && previousRoomId.current) {
      void trackAnalyticsEvent('room_leave', previousRoomId.current);
      previousRoomId.current = null;
    }
    void trackAnalyticsEvent('page_view', null, { path, countryEstimate });
  }, [location.pathname]);

  return null;
}
