const dateTime = new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' });
const date = new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeZone: 'Asia/Kuala_Lumpur' });

/** All dates are shown in Malaysia time. */
export const formatDateTime = (iso: string | Date | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—');
export const formatDate = (iso: string | Date | null | undefined) => (iso ? date.format(new Date(iso)) : '—');
