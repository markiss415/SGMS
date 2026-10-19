import { execute, type Db } from '../db/pool.js';
import { newId } from './ids.js';

export type NotificationType = 'schedule' | 'disposal' | 'payment' | 'endorsement' | 'system' | 'announcement';

/** Creates an in-app notification. `link` is the sidebar tab the bell should open. */
export async function notify(
  db: Db,
  userId: string | null | undefined,
  title: string,
  message: string,
  type: NotificationType,
  link = '',
): Promise<void> {
  if (!userId) return;
  await execute(
    'INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?, ?)',
    [newId('ntf'), userId, title.slice(0, 150), message, type, link],
    db,
  );
}

/** Notifies every active user matching the WHERE clause (parameterized). */
export async function notifyMany(
  db: Db,
  where: string,
  params: unknown[],
  title: string,
  message: string,
  type: NotificationType,
  link = '',
): Promise<void> {
  await execute(
    `INSERT INTO notifications (id, user_id, title, message, type, link)
     SELECT CONCAT('ntf-', UUID()), u.id, ?, ?, ?, ? FROM users u WHERE u.status = 'active' AND (${where})`,
    [title.slice(0, 150), message, type, link, ...params],
    db,
  );
}
