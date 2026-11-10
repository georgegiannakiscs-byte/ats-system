/* Third-party marks used only to label integration cards. */
export function LinkedInLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path fill="#fff" d="M7.1 9.4h-2.6V19h2.6V9.4ZM5.8 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm13.7 8.5c0-2.6-1.4-4.3-3.8-4.3-1.3 0-2.2.7-2.6 1.4V9.4h-2.5V19h2.6v-5c0-1.3.4-2.4 1.8-2.4 1.4 0 1.9 1 1.9 2.5V19h2.6v-5.5Z" />
    </svg>
  );
}

export function GoogleCalendarLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#fff" stroke="#DADCE0" />
      <path d="M3 7.5h18V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v1.5Z" fill="#4285F4" />
      <path d="M17 21h1a3 3 0 0 0 3-3v-1h-4v4Z" fill="#34A853" />
      <path d="M21 17v-4h-4v4h4Z" fill="#FBBC04" opacity=".9" />
      <text x="12" y="17.2" textAnchor="middle" fontSize="8" fontWeight="700" fill="#4285F4" fontFamily="system-ui, sans-serif">31</text>
    </svg>
  );
}

export function OutlookLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="8" y="4" width="13" height="16" rx="2" fill="#28A8EA" />
      <path d="M8 10l6.5 4L21 10v8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-8Z" fill="#0078D4" />
      <rect x="3" y="7" width="10" height="10" rx="1.5" fill="#0364B8" />
      <ellipse cx="8" cy="12" rx="2.4" ry="2.9" fill="none" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

export function GmailLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M3 7.5 12 13.5l9-6V18a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 18V7.5Z" fill="#fff" stroke="#DADCE0" strokeWidth=".5" />
      <path d="M3 6.8V18c0 .8.7 1.5 1.5 1.5H7V10.2l5 3.5 5-3.5v9.3h2.5c.8 0 1.5-.7 1.5-1.5V6.8c0-1.6-1.8-2.5-3.1-1.6L12 9 6.1 5.2C4.8 4.3 3 5.2 3 6.8Z" fill="#EA4335" />
      <path d="M17 19.5h2.5c.8 0 1.5-.7 1.5-1.5V6.8c0-.7-.4-1.3-1-1.5L17 7.8v11.7Z" fill="#34A853" />
      <path d="M3 6.8V18c0 .8.7 1.5 1.5 1.5H7V7.8L4 5.3c-.6.3-1 .8-1 1.5Z" fill="#4285F4" />
    </svg>
  );
}
