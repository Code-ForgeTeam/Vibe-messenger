<?php
declare(strict_types=1);

namespace App;

use PDO;

final class Api
{
    private const STORY_MAX_MEDIA_ITEMS = 10;
    private const STORY_LIFETIME_HOURS = 24;

    private ?PDO $db = null;
    private ?array $chatParticipantColumns = null;
    private ?array $userColumns = null;
    private ?bool $attachmentsTableReady = null;
    private ?bool $messageReactionTableReady = null;
    private ?bool $messagePinsTableReady = null;
    private ?bool $chatReadStateTableReady = null;
    private ?bool $pushTokensTableReady = null;
    private ?bool $storyTablesReady = null;
    private ?bool $storyMediaTableReady = null;
    private ?bool $notificationsTablesReady = null;
    private ?bool $appSettingsTableReady = null;
    private ?array $chatColumns = null;
    private ?array $notificationColumns = null;
    private ?array $firebaseAccessTokenCache = null;

    public function __construct()
    {
    }

    public function handle(): void
    {
        $this->cors();
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            return;
        }

        $rawPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $path = $this->normalizePath($rawPath);
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $body = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];

        if ($path === '/health') { $this->json(['ok' => true]); }
        if ($path === '/api') { $this->json(['ok' => true, 'message' => 'API root']); }
        if ($path === '/api/app/config' && $method === 'GET') { $this->appConfig(); }
        if ($path === '/api/game/online' && $method === 'GET') { $this->gameOnlineStatus(); }

        if ($path === '/api/auth/register' && $method === 'POST') { $this->register($body); }
        if ($path === '/api/auth/login' && $method === 'POST') { $this->login($body); }
        if ($path === '/api/auth/verify' && $method === 'GET') { $this->verify(); }
        if ($path === '/api/admin/overview' && $method === 'GET') { $this->adminOverview(); }
        if ($path === '/api/admin/clear-chats' && $method === 'POST') { $this->adminClearChats(); }
        if ($path === '/api/admin/clear-messages' && $method === 'POST') { $this->adminClearMessages(); }
        if ($path === '/api/admin/clear-content' && $method === 'POST') { $this->adminClearContent(); }
        if ($path === '/api/admin/clear-push-tokens' && $method === 'POST') { $this->adminClearPushTokens(); }
        if ($path === '/api/admin/reset-users' && $method === 'POST') { $this->adminResetUsers(); }
        if ($path === '/api/admin/users' && $method === 'GET') { $this->adminUsers(); }
        if ($path === '/api/admin/app-config' && $method === 'PUT') { $this->adminUpdateAppConfig($body); }
        if ($path === '/api/admin/events' && $method === 'POST') { $this->adminCreateEvent($body); }

        if ($path === '/api/users/me' && $method === 'GET') { $this->me(); }
        if ($path === '/api/users/me' && $method === 'PUT') { $this->updateMe($body); }
        if ($path === '/api/users/me/notifications' && $method === 'GET') { $this->meNotificationSettings(); }
        if ($path === '/api/users/me/notifications' && $method === 'PUT') { $this->updateMeNotificationSettings($body); }
        if ($path === '/api/users/search' && $method === 'GET') { $this->searchUsers(); }
        if ($path === '/api/notifications' && $method === 'GET') { $this->activeNotifications(); }
        if ($path === '/api/notifications/dismiss-all' && $method === 'POST') { $this->dismissAllNotifications(); }

        if (preg_match('#^/api/users/by-username/([^/]+)$#', $path, $m) && $method === 'GET') {
            $this->userByUsername(urldecode($m[1]));
        }

        if (preg_match('#^/api/users/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'GET') {
            $this->userById($m[1]);
        }

        if ($path === '/api/chats' && $method === 'GET') { $this->chats(); }
        if ($path === '/api/chats' && $method === 'POST') { $this->createChat($body); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'GET') { $this->chatById($m[1]); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'DELETE') { $this->deleteChat($m[1], $body); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/messages$#', $path, $m) && $method === 'DELETE') { $this->clearChatMessages($m[1]); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/pins$#', $path, $m) && $method === 'GET') { $this->chatPinnedMessages($m[1]); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/pins$#', $path, $m) && $method === 'POST') { $this->pinChatMessage($m[1], $body); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/pins/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'DELETE') { $this->unpinChatMessage($m[1], $m[2]); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/archive$#', $path, $m) && $method === 'POST') { $this->setChatArchive($m[1], true); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/archive$#', $path, $m) && $method === 'DELETE') { $this->setChatArchive($m[1], false); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/participants$#', $path, $m) && $method === 'POST') { $this->addGroupParticipants($m[1], $body); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/participants/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'DELETE') { $this->removeGroupParticipant($m[1], $m[2]); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/group$#', $path, $m) && $method === 'PUT') { $this->updateGroupChat($m[1], $body); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/mute$#', $path, $m) && $method === 'POST') { $this->toggleChatMute($m[1]); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/pin$#', $path, $m) && $method === 'POST') { $this->toggleChatPin($m[1]); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/block$#', $path, $m) && $method === 'POST') { $this->blockInChat($m[1], $body); }
        if (preg_match('#^/api/chats/([a-zA-Z0-9\-]+)/block$#', $path, $m) && $method === 'DELETE') { $this->unblockInChat($m[1]); }
        if ($path === '/api/saved/chat' && $method === 'GET') { $this->savedChat(); }
        if ($path === '/api/messages' && $method === 'POST') { $this->sendMessage($body); }
        if ($path === '/api/messages/read' && $method === 'POST') { $this->markMessagesRead($body); }
        if ($path === '/api/push/token' && $method === 'POST') { $this->registerPushToken($body); }
        if ($path === '/api/push/token' && $method === 'DELETE') { $this->removePushToken($body); }
        if ($path === '/api/stories' && $method === 'GET') { $this->storiesFeed(); }
        if ($path === '/api/stories' && $method === 'POST') { $this->createStory($body); }
        if ($path === '/api/stories/mine' && $method === 'GET') { $this->myStories(); }
        if (preg_match('#^/api/stories/([a-zA-Z0-9\-]+)/view$#', $path, $m) && $method === 'POST') { $this->viewStory($m[1]); }
        if (preg_match('#^/api/stories/([a-zA-Z0-9\-]+)/viewers$#', $path, $m) && $method === 'GET') { $this->storyViewers($m[1]); }
        if (preg_match('#^/api/stories/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'DELETE') { $this->deleteStory($m[1]); }
        if ($path === '/api/ai/chat' && $method === 'GET') { $this->aiChat(); }
        if ($path === '/api/ai/message' && $method === 'POST') { $this->aiMessage($body); }
        if ($path === '/api/upload' && $method === 'POST') { $this->uploadFiles(); }
        if ($path === '/api/upload/avatar' && $method === 'POST') { $this->uploadAvatar(); }
        if ($path === '/api/upload/story' && $method === 'POST') { $this->uploadStoryFiles(); }
        if ($path === '/api/upload/group-avatar' && $method === 'POST') { $this->uploadGroupAvatar(); }
        if ($path === '/api/upload/storage-stats' && $method === 'GET') { $this->uploadStorageStats(); }
        if ($path === '/api/upload/clear-cache' && $method === 'DELETE') { $this->clearUploadCache(); }
        if ($path === '/api/admin/users/delete' && $method === 'POST') { $this->adminDeleteUser($body); }

        if (preg_match('#^/api/messages/chat/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'GET') { $this->chatMessages($m[1]); }
        if (preg_match('#^/api/messages/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'PUT') { $this->editMessage($m[1], $body); }
        if (preg_match('#^/api/messages/([a-zA-Z0-9\-]+)$#', $path, $m) && $method === 'DELETE') { $this->deleteMessage($m[1], $body); }
        if (preg_match('#^/api/messages/([a-zA-Z0-9\-]+)/reaction$#', $path, $m) && $method === 'POST') { $this->setMessageReaction($m[1], $body); }
        if (preg_match('#^/api/messages/([a-zA-Z0-9\-]+)/reaction$#', $path, $m) && $method === 'DELETE') { $this->removeMessageReaction($m[1]); }
        if (preg_match('#^/api/messages/([a-zA-Z0-9\-]+)/reactions$#', $path, $m) && $method === 'GET') { $this->messageReactions($m[1]); }
        if (preg_match('#^/api/notifications/([a-zA-Z0-9\-]+)/dismiss$#', $path, $m) && $method === 'POST') { $this->dismissNotification($m[1]); }

        $this->json(['error' => 'Not found', 'path' => $path], 404);
    }

    private function register(array $body): void
    {
        $u = trim((string)($body['username'] ?? ''));
        $n = trim((string)($body['fullName'] ?? ''));
        $p = (string)($body['password'] ?? '');
        if ($u === '' || $n === '' || strlen($p) < 6) $this->json(['error' => 'Invalid payload'], 400);

        $id = $this->uuid();
        $hash = password_hash($p, PASSWORD_BCRYPT);
        $stmt = $this->db()->prepare('INSERT INTO users (id, username, full_name, password_hash) VALUES (?, ?, ?, ?)');
        try {
            $stmt->execute([$id, $u, $n, $hash]);
        } catch (\PDOException $e) {
            if ((string)$e->getCode() === '23000') {
                $this->json(['error' => 'Username already exists'], 409);
            }
            $this->json(['error' => 'Registration failed'], 500);
        } catch (\Throwable) {
            $this->json(['error' => 'Registration failed'], 500);
        }

        $this->touchUserPresence($id);
        $token = Jwt::issue(['userId' => $id]);
        $this->json([
            'token' => $token,
            'user' => [
                'id' => $id,
                'username' => $u,
                'fullName' => $n,
                'avatar' => null,
                'birthday' => null,
                'isCreator' => $this->isCreatorMatch($id),
            ],
        ]);
    }

    private function login(array $body): void
    {
        $u = trim((string)($body['username'] ?? ''));
        $p = (string)($body['password'] ?? '');

        try {
            $select = 'SELECT id, username, full_name, avatar, password_hash';
            if ($this->hasUserColumn('birth_date')) {
                $select .= ', birth_date';
            }
            if ($this->hasUserColumn('is_banned')) {
                $select .= ', is_banned';
            }
            if ($this->hasUserColumn('ban_reason')) {
                $select .= ', ban_reason';
            }
            $select .= ' FROM users WHERE username = ? LIMIT 1';
            $stmt = $this->db()->prepare($select);
            $stmt->execute([$u]);
            $user = $stmt->fetch();
        } catch (\Throwable) {
            $this->json(['error' => 'Login failed'], 500);
        }

        if (!$user || !password_verify($p, $user['password_hash'])) {
            $this->json(['error' => 'invalid_credentials', 'message' => 'Неправильный логин или пароль'], 401);
        }
        if ($this->hasUserColumn('is_banned') && !empty($user['is_banned'])) {
            $this->json([
                'error' => 'banned',
                'reason' => $this->hasUserColumn('ban_reason') ? (string)($user['ban_reason'] ?? '') : '',
                'message' => 'Данный пользователь заблокирован',
            ], 403);
        }

        $this->touchUserPresence((string)$user['id']);
        $token = Jwt::issue(['userId' => $user['id']]);
        $this->json([
            'token' => $token,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'fullName' => $user['full_name'],
                'avatar' => $user['avatar'] ?? null,
                'birthday' => $user['birth_date'] ?? null,
                'isCreator' => $this->isCreatorMatch((string)$user['id']),
            ],
        ]);
    }

    private function verify(): void
    {
        $userId = $this->authUserId();
        $this->ensureUserProfileColumns();
        $select = 'SELECT id, username, full_name, avatar, status, last_seen';
        if ($this->hasUserColumn('birth_date')) {
            $select .= ', birth_date';
        }
        $select .= ' FROM users WHERE id = ? LIMIT 1';
        $stmt = $this->db()->prepare($select);
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        if (!$u) $this->json(['error' => 'Unauthorized'], 401);

        $presence = $this->normalizePresence((string)($u['status'] ?? 'offline'), $u['last_seen'] ?? null);

        $this->json(['user' => [
            'id' => $u['id'],
            'username' => $u['username'],
            'fullName' => $u['full_name'],
            'avatar' => $u['avatar'] ?? null,
            'status' => $presence['status'],
            'lastSeen' => $presence['lastSeen'],
            'birthday' => $u['birth_date'] ?? null,
            'isCreator' => $this->isCreatorMatch((string)$u['id']),
        ]]);
    }

    private function chats(): void
    {
        $userId = $this->authUserId();
        $metaSelect = $this->chatParticipantMetaSelectSql();
        $orderBy = $this->chatParticipantOrderBySql();

        $stmt = $this->db()->prepare(
            "SELECT c.id, c.name, c.type, c.avatar, c.updated_at,
"
            . "                    {$metaSelect}
"
            . "             FROM chats c
"
            . "             JOIN chat_participants cp ON cp.chat_id = c.id
"
            . "             WHERE cp.user_id = ?
"
            . "             ORDER BY {$orderBy}"
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();

        $payload = array_map(fn ($row) => $this->buildChatPayload($row, $userId), $rows ?: []);
        $this->json($payload);
    }

    private function appConfig(): void
    {
        $this->json($this->appConfigPayload());
    }

    private function adminOverview(): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);

        $users = (int)$this->db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
        $chats = (int)$this->db()->query("SELECT COUNT(*) FROM chats WHERE COALESCE(type, 'private') <> 'saved'")->fetchColumn();
        $messages = (int)$this->db()->query('SELECT COUNT(*) FROM messages')->fetchColumn();

        $this->json([
            'ok' => true,
            'users' => $users,
            'chats' => $chats,
            'messages' => $messages,
            'creatorUserId' => $this->creatorUserId(),
            'gameEnabled' => $this->readAppSettingBool('game_enabled', true),
        ]);
    }

    private function adminUpdateAppConfig(array $body): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);

        $gameEnabled = array_key_exists('gameEnabled', $body)
            ? (bool)$body['gameEnabled']
            : $this->readAppSettingBool('game_enabled', true);

        if (!$this->writeAppSetting('game_enabled', $gameEnabled ? '1' : '0')) {
            $this->json(['error' => 'Failed to update app configuration'], 500);
        }

        $this->json([
            'ok' => true,
            'gameEnabled' => $gameEnabled,
        ]);
    }

    private function adminUsers(): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);
        $this->ensureUserProfileColumns();

        $select = 'SELECT id, username, full_name, bio, avatar, status, last_seen';
        if ($this->hasUserColumn('birth_date')) {
            $select .= ', birth_date';
        }
        $select .= ' FROM users ORDER BY updated_at DESC, created_at DESC, username ASC';

        try {
            $rows = $this->db()->query($select)->fetchAll() ?: [];
        } catch (\Throwable) {
            $fallback = 'SELECT id, username, full_name, bio, avatar, status, last_seen';
            if ($this->hasUserColumn('birth_date')) {
                $fallback .= ', birth_date';
            }
            $fallback .= ' FROM users ORDER BY username ASC';
            $rows = $this->db()->query($fallback)->fetchAll() ?: [];
        }

        $items = array_map(function ($u) {
            $presence = $this->normalizePresence((string)($u['status'] ?? 'offline'), $u['last_seen'] ?? null);
            return [
                'id' => (string)($u['id'] ?? ''),
                'username' => (string)($u['username'] ?? ''),
                'fullName' => (string)($u['full_name'] ?? ''),
                'bio' => $u['bio'] ?? null,
                'avatar' => $u['avatar'] ?? null,
                'status' => $presence['status'],
                'lastSeen' => $presence['lastSeen'],
                'birthday' => $u['birth_date'] ?? null,
                'isCreator' => $this->isCreatorMatch((string)($u['id'] ?? '')),
            ];
        }, $rows);

        $this->json([
            'ok' => true,
            'count' => count($items),
            'items' => $items,
        ]);
    }

    private function adminClearChats(): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);

        $this->deleteAllAttachmentFiles();
        $this->db()->exec('DELETE FROM chats');
        $this->json(['ok' => true]);
    }

    private function adminClearMessages(): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);

        $this->deleteAllAttachmentFiles();
        $this->db()->exec('DELETE FROM messages');

        if ($this->hasChatParticipantColumn('unread_count')) {
            $this->db()->exec('UPDATE chat_participants SET unread_count = 0');
        }

        $this->db()->exec('UPDATE chats SET updated_at = CURRENT_TIMESTAMP');
        $this->json(['ok' => true]);
    }

    private function adminClearContent(): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);

        $publicDir = dirname(__DIR__) . '/public';
        $clearedFilesBytes = $this->clearDirectoryContents($publicDir . '/uploads/messages');
        $clearedFilesBytes += $this->clearDirectoryContents($publicDir . '/uploads/stories');

        if ($this->ensureAttachmentsTable()) {
            try {
                $this->db()->exec('DELETE FROM attachments');
            } catch (\Throwable) {
                // ignore table cleanup errors on restricted hosting
            }
        }

        if ($this->ensureStoryTables()) {
            try {
                $this->db()->exec('DELETE FROM stories');
            } catch (\Throwable) {
                // ignore table cleanup errors on restricted hosting
            }
        }

        $this->json([
            'ok' => true,
            'clearedFilesBytes' => $clearedFilesBytes,
        ]);
    }

    private function adminClearPushTokens(): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);

        if (!$this->ensurePushTokensTable()) {
            $this->json(['error' => 'Push tokens table is unavailable'], 500);
        }

        try {
            $count = (int)$this->db()->query('SELECT COUNT(*) FROM push_tokens')->fetchColumn();
            $this->db()->exec('DELETE FROM push_tokens');
        } catch (\Throwable) {
            $this->json(['error' => 'Failed to clear push tokens'], 500);
        }

        $this->json([
            'ok' => true,
            'deleted' => $count,
        ]);
    }

    private function adminResetUsers(): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);

        $creatorId = $this->creatorUserId();
        if ($creatorId === '') {
            $this->json(['error' => 'Creator user is not configured'], 500);
        }

        $db = $this->db();
        try {
            $db->beginTransaction();

            $deleteUsers = $db->prepare('DELETE FROM users WHERE id <> ?');
            $deleteUsers->execute([$creatorId]);

            if ($this->ensurePushTokensTable()) {
                $dropTokens = $db->prepare('DELETE FROM push_tokens WHERE user_id <> ?');
                $dropTokens->execute([$creatorId]);
            }

            $db->exec('DELETE c FROM chats c LEFT JOIN chat_participants cp ON cp.chat_id = c.id WHERE cp.chat_id IS NULL');

            if ($this->hasChatParticipantColumn('unread_count')) {
                $resetUnread = $db->prepare('UPDATE chat_participants SET unread_count = 0 WHERE user_id = ?');
                $resetUnread->execute([$creatorId]);
            }

            $db->commit();
        } catch (\Throwable) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $this->json(['error' => 'Failed to reset users'], 500);
        }

        $this->json(['ok' => true, 'creatorUserId' => $creatorId]);
    }

    private function adminDeleteUser(array $body): void
    {
        $actorId = $this->authUserId();
        $this->assertCreator($actorId);

        $username = trim((string)($body['username'] ?? ''));
        if ($username === '') {
            $this->json(['error' => 'username is required'], 400);
        }

        $find = $this->db()->prepare('SELECT id, username FROM users WHERE username = ? LIMIT 1');
        $find->execute([$username]);
        $target = $find->fetch();
        if (!$target) {
            $this->json(['error' => 'User not found'], 404);
        }

        $creatorId = $this->creatorUserId();
        if ($creatorId !== '' && (string)$target['id'] === $creatorId) {
            $this->json(['error' => 'Нельзя удалить владельца приложения'], 400);
        }

        $db = $this->db();
        try {
            $db->beginTransaction();
            if ($this->ensurePushTokensTable()) {
                $dropTokens = $db->prepare('DELETE FROM push_tokens WHERE user_id = ?');
                $dropTokens->execute([(string)$target['id']]);
            }
            $delete = $db->prepare('DELETE FROM users WHERE id = ? LIMIT 1');
            $delete->execute([(string)$target['id']]);
            $db->exec('DELETE c FROM chats c LEFT JOIN chat_participants cp ON cp.chat_id = c.id WHERE cp.chat_id IS NULL');
            $db->commit();
        } catch (\Throwable) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $this->json(['error' => 'Не удалось удалить пользователя'], 500);
        }

        $this->json([
            'ok' => true,
            'username' => $target['username'],
            'deleted' => true,
        ]);
    }

    private function adminCreateEvent(array $body): void
    {
        $userId = $this->authUserId();
        $this->assertCreator($userId);

        $template = strtolower(trim((string)($body['template'] ?? 'custom')));
        if ($template !== 'update') {
            $template = 'custom';
        }

        $title = trim((string)($body['title'] ?? ''));
        $message = trim((string)($body['message'] ?? ''));
        if ($template === 'update') {
            $title = 'Доступно обновление';
            $message = 'Обновление на сайте';
        }
        if ($title === '' && $message === '') {
            $this->json(['error' => 'Event title or message is required'], 400);
        }

        $downloadUrlRaw = trim((string)($body['downloadUrl'] ?? ''));
        $downloadUrl = $this->normalizeExternalUrl($downloadUrlRaw);
        if ($template === 'update' && $downloadUrl === null) {
            $this->json(['error' => 'Для обновления требуется корректная ссылка downloadUrl (http/https)'], 400);
        }
        if ($template !== 'update' && $downloadUrlRaw !== '' && $downloadUrl === null) {
            $this->json(['error' => 'Некорректная ссылка downloadUrl'], 400);
        }

        $dispatch = $this->sendAdminEventPush([
            'template' => $template,
            'title' => $title !== '' ? $title : 'Vibe',
            'message' => $message,
            'downloadUrl' => $downloadUrl,
        ]);
        if (empty($dispatch['ok'])) {
            $this->json([
                'error' => (string)($dispatch['error'] ?? 'Не удалось отправить push-ивент'),
            ], 500);
        }

        $this->json([
            'ok' => true,
            'event' => [
                'id' => $this->uuid(),
                'template' => $template,
                'title' => $title !== '' ? $title : null,
                'message' => $message !== '' ? $message : null,
                'downloadUrl' => $downloadUrl,
            ],
            'sent' => (int)($dispatch['sent'] ?? 0),
        ], 201);
    }

    private function activeNotifications(): void
    {
        $userId = $this->authUserId();
        if ($this->ensureNotificationsTables()) {
            try {
                $stmt = $this->db()->prepare(
                    'SELECT n.id, n.title, n.message, n.bg_color, n.text_color, n.duration_ms, n.show_once
                     FROM notifications n
                     WHERE n.active = 1
                       AND (n.expires_at IS NULL OR n.expires_at > CURRENT_TIMESTAMP)
                       AND NOT EXISTS (
                         SELECT 1 FROM notification_dismissals d
                         WHERE d.notification_id = n.id AND d.user_id = ?
                       )
                     ORDER BY n.created_at DESC
                     LIMIT 20'
                );
                $stmt->execute([$userId]);
                $rows = $stmt->fetchAll() ?: [];

                $items = array_map(function ($row) {
                    return [
                        'id' => (string)($row['id'] ?? ''),
                        'title' => $row['title'] ?? null,
                        'message' => $row['message'] ?? null,
                        'bgColor' => $row['bg_color'] ?? null,
                        'textColor' => $row['text_color'] ?? null,
                        'durationMs' => max(2000, min(15000, (int)($row['duration_ms'] ?? 5000))),
                        'dismissable' => true,
                        'showOnce' => !empty($row['show_once']),
                    ];
                }, $rows);

                $this->json($items);
            } catch (\Throwable) {
                // fallback below
            }
        }

        $this->json($this->activeNotificationsFallback($userId));
    }

    private function dismissNotification(string $notificationId): void
    {
        $userId = $this->authUserId();
        $id = trim($notificationId);
        if ($id === '') {
            $this->json(['ok' => true]);
        }
        if (!$this->ensureNotificationsTables()) {
            $this->dismissNotificationFallback($id, $userId);
            $this->json(['ok' => true]);
        }

        try {
            $showOnce = true;
            $metaSql = $this->hasNotificationColumn('show_once')
                ? 'SELECT id, show_once FROM notifications WHERE id = ? LIMIT 1'
                : 'SELECT id FROM notifications WHERE id = ? LIMIT 1';
            $meta = $this->db()->prepare($metaSql);
            $meta->execute([$id]);
            $row = $meta->fetch();
            if (!$row) {
                $this->dismissNotificationFallback($id, $userId);
                $this->json(['ok' => true]);
            }
            if ($this->hasNotificationColumn('show_once')) {
                $showOnce = !empty($row['show_once']);
            }
            if ($showOnce) {
                try {
                    $this->db()->beginTransaction();
                    $delDismiss = $this->db()->prepare('DELETE FROM notification_dismissals WHERE notification_id = ?');
                    $delDismiss->execute([$id]);
                    $delNotif = $this->db()->prepare('DELETE FROM notifications WHERE id = ?');
                    $delNotif->execute([$id]);
                    $this->db()->commit();
                } catch (\Throwable) {
                    if ($this->db()->inTransaction()) {
                        $this->db()->rollBack();
                    }
                    throw new \RuntimeException('Failed to delete show-once notification');
                }

                $this->dismissNotificationFallback($id, $userId);
                $this->json(['ok' => true]);
            }

            $stmt = $this->db()->prepare(
                'INSERT INTO notification_dismissals (notification_id, user_id, dismissed_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE dismissed_at = CURRENT_TIMESTAMP'
            );
            $stmt->execute([$id, $userId]);
        } catch (\Throwable) {
            $this->dismissNotificationFallback($id, $userId);
        }
        $this->json(['ok' => true]);
    }

    private function dismissAllNotifications(): void
    {
        $userId = $this->authUserId();
        $dismissed = 0;

        if ($this->ensureNotificationsTables()) {
            try {
                $rowsStmt = $this->db()->prepare(
                    'SELECT n.id, n.show_once
                     FROM notifications n
                     WHERE n.active = 1
                       AND (n.expires_at IS NULL OR n.expires_at > CURRENT_TIMESTAMP)
                       AND NOT EXISTS (
                         SELECT 1 FROM notification_dismissals d
                         WHERE d.notification_id = n.id AND d.user_id = ?
                       )'
                );
                $rowsStmt->execute([$userId]);
                $rows = $rowsStmt->fetchAll() ?: [];

                foreach ($rows as $row) {
                    $notificationId = trim((string)($row['id'] ?? ''));
                    if ($notificationId === '') {
                        continue;
                    }
                    $showOnce = !empty($row['show_once']);

                    if ($showOnce) {
                        try {
                            $this->db()->beginTransaction();
                            $delDismiss = $this->db()->prepare('DELETE FROM notification_dismissals WHERE notification_id = ?');
                            $delDismiss->execute([$notificationId]);
                            $delNotif = $this->db()->prepare('DELETE FROM notifications WHERE id = ?');
                            $delNotif->execute([$notificationId]);
                            $this->db()->commit();
                        } catch (\Throwable) {
                            if ($this->db()->inTransaction()) {
                                $this->db()->rollBack();
                            }
                        }
                    } else {
                        try {
                            $dismissStmt = $this->db()->prepare(
                                'INSERT INTO notification_dismissals (notification_id, user_id, dismissed_at)
                                 VALUES (?, ?, CURRENT_TIMESTAMP)
                                 ON DUPLICATE KEY UPDATE dismissed_at = CURRENT_TIMESTAMP'
                            );
                            $dismissStmt->execute([$notificationId, $userId]);
                        } catch (\Throwable) {
                            // fallback below
                        }
                    }

                    $dismissed++;
                }
            } catch (\Throwable) {
                // fallback below
            }
        }

        $fallbackDismissed = $this->dismissAllNotificationsFallback($userId);
        if ($fallbackDismissed > $dismissed) {
            $dismissed = $fallbackDismissed;
        }

        $this->json([
            'ok' => true,
            'dismissed' => $dismissed,
        ]);
    }

    private function ensureNotificationsTables(): bool
    {
        if ($this->notificationsTablesReady !== null) {
            return $this->notificationsTablesReady;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS notifications (
                    id CHAR(36) PRIMARY KEY,
                    title VARCHAR(255) NULL,
                    message TEXT NULL,
                    bg_color VARCHAR(32) NULL,
                    text_color VARCHAR(32) NULL,
                    duration_ms INT NOT NULL DEFAULT 5000,
                    show_once TINYINT(1) NOT NULL DEFAULT 1,
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    created_by CHAR(36) NULL,
                    expires_at DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_notifications_active_created (active, created_at),
                    KEY idx_notifications_expires (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS notification_dismissals (
                    notification_id CHAR(36) NOT NULL,
                    user_id CHAR(36) NOT NULL,
                    dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (notification_id, user_id),
                    KEY idx_notification_dismissals_user (user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );

            $columns = $this->notificationColumns();
            $applyColumn = function (string $name, string $definition) use (&$columns): void {
                if (isset($columns[$name])) {
                    return;
                }
                try {
                    $this->db()->exec("ALTER TABLE notifications ADD COLUMN {$name} {$definition}");
                    $columns[$name] = true;
                } catch (\Throwable) {
                    // Keep graceful fallback on shared hosting with restricted ALTER privileges.
                }
            };

            // Legacy schema compatibility: old table used is_active.
            if (!isset($columns['active'])) {
                if (isset($columns['is_active'])) {
                    try {
                        $this->db()->exec('ALTER TABLE notifications ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1');
                        $this->db()->exec('UPDATE notifications SET active = COALESCE(is_active, 1)');
                        $columns['active'] = true;
                    } catch (\Throwable) {
                        // ignore migration errors
                    }
                } else {
                    $applyColumn('active', 'TINYINT(1) NOT NULL DEFAULT 1');
                }
            }

            $applyColumn('duration_ms', 'INT NOT NULL DEFAULT 5000');
            $applyColumn('show_once', 'TINYINT(1) NOT NULL DEFAULT 1');
            $applyColumn('created_by', 'CHAR(36) NULL');
            $applyColumn('expires_at', 'DATETIME NULL');
            $applyColumn('created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
            $applyColumn('updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
            $applyColumn('bg_color', 'VARCHAR(32) NULL');
            $applyColumn('text_color', 'VARCHAR(32) NULL');

            $this->notificationColumns = $columns;
            $this->notificationsTablesReady = true;
        } catch (\Throwable) {
            $this->notificationsTablesReady = false;
        }

        return $this->notificationsTablesReady;
    }

    private function appConfigPayload(): array
    {
        return [
            'ok' => true,
            'gameEnabled' => $this->readAppSettingBool('game_enabled', true),
        ];
    }

    private function readAppSettingBool(string $key, bool $default): bool
    {
        $value = $this->readAppSetting($key);
        if ($value === null) {
            return $default;
        }

        $normalized = strtolower(trim($value));
        if ($normalized === '0' || $normalized === 'false' || $normalized === 'off' || $normalized === 'no') {
            return false;
        }
        if ($normalized === '1' || $normalized === 'true' || $normalized === 'on' || $normalized === 'yes') {
            return true;
        }

        return $default;
    }

    private function readAppSetting(string $key): ?string
    {
        if (!$this->ensureAppSettingsTable()) {
            return null;
        }

        try {
            $stmt = $this->db()->prepare('SELECT value_text FROM app_settings WHERE setting_key = ? LIMIT 1');
            $stmt->execute([$key]);
            $value = $stmt->fetchColumn();
        } catch (\Throwable) {
            return null;
        }

        if ($value === false || $value === null) {
            return null;
        }

        return (string)$value;
    }

    private function writeAppSetting(string $key, string $value): bool
    {
        if (!$this->ensureAppSettingsTable()) {
            return false;
        }

        try {
            $stmt = $this->db()->prepare(
                'INSERT INTO app_settings (setting_key, value_text, updated_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), updated_at = CURRENT_TIMESTAMP'
            );
            $stmt->execute([$key, $value]);
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function ensureAppSettingsTable(): bool
    {
        if ($this->appSettingsTableReady !== null) {
            return $this->appSettingsTableReady;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS app_settings (
                    setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
                    value_text TEXT NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
            $this->appSettingsTableReady = true;
        } catch (\Throwable) {
            $this->appSettingsTableReady = false;
        }

        return $this->appSettingsTableReady;
    }

    private function normalizeNotificationColor(string $raw): ?string
    {
        $value = trim($raw);
        if ($value === '') return null;
        if (!preg_match('/^#?[0-9a-f]{6}$/i', $value)) {
            return null;
        }
        return '#' . strtoupper(ltrim($value, '#'));
    }

    private function normalizeExternalUrl(string $raw): ?string
    {
        $value = trim($raw);
        if ($value === '') {
            return null;
        }

        $validated = filter_var($value, FILTER_VALIDATE_URL);
        if (!is_string($validated) || $validated === '') {
            return null;
        }

        $scheme = strtolower((string)parse_url($validated, PHP_URL_SCHEME));
        if ($scheme !== 'http' && $scheme !== 'https') {
            return null;
        }

        return $validated;
    }

    private function notificationsFallbackPath(): string
    {
        $dir = dirname(__DIR__) . '/public/uploads/cache';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir . '/notifications_fallback.json';
    }

    private function readNotificationsFallback(): array
    {
        $path = $this->notificationsFallbackPath();
        if (!is_file($path)) {
            return [];
        }

        $raw = @file_get_contents($path);
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $rows = [];
        foreach ($decoded as $row) {
            $normalized = $this->normalizeFallbackNotificationRow($row);
            if ($normalized !== null) {
                $rows[] = $normalized;
            }
        }
        return $rows;
    }

    private function writeNotificationsFallback(array $rows): bool
    {
        $path = $this->notificationsFallbackPath();
        $encoded = json_encode(array_values($rows), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($encoded === false) {
            return false;
        }
        return @file_put_contents($path, $encoded, LOCK_EX) !== false;
    }

    private function normalizeFallbackNotificationRow($row): ?array
    {
        if (!is_array($row)) {
            return null;
        }

        $id = trim((string)($row['id'] ?? ''));
        if ($id === '') {
            return null;
        }

        $dismissedByRaw = $row['dismissedBy'] ?? [];
        if (!is_array($dismissedByRaw)) {
            $dismissedByRaw = [];
        }
        $dismissedBy = array_values(array_unique(array_filter(array_map(
            fn ($value) => trim((string)$value),
            $dismissedByRaw
        ))));

        $durationMs = max(2000, min(15000, (int)($row['durationMs'] ?? 5000)));
        $createdAt = trim((string)($row['createdAt'] ?? ''));
        if ($createdAt === '') {
            $createdAt = date('c');
        }

        $expiresAt = trim((string)($row['expiresAt'] ?? ''));
        return [
            'id' => $id,
            'title' => $row['title'] ?? null,
            'message' => $row['message'] ?? null,
            'bgColor' => $this->normalizeNotificationColor((string)($row['bgColor'] ?? '')),
            'textColor' => $this->normalizeNotificationColor((string)($row['textColor'] ?? '')),
            'durationMs' => $durationMs,
            'showOnce' => !empty($row['showOnce']),
            'active' => !array_key_exists('active', $row) || !empty($row['active']),
            'expiresAt' => $expiresAt === '' ? null : $expiresAt,
            'createdAt' => $createdAt,
            'dismissedBy' => $dismissedBy,
        ];
    }

    private function appendNotificationFallback(array $payload): bool
    {
        $rows = $this->readNotificationsFallback();
        $normalized = $this->normalizeFallbackNotificationRow([
            'id' => (string)($payload['id'] ?? $this->uuid()),
            'title' => $payload['title'] ?? null,
            'message' => $payload['message'] ?? null,
            'bgColor' => $payload['bgColor'] ?? null,
            'textColor' => $payload['textColor'] ?? null,
            'durationMs' => $payload['durationMs'] ?? 5000,
            'showOnce' => $payload['showOnce'] ?? true,
            'active' => $payload['active'] ?? true,
            'expiresAt' => $payload['expiresAt'] ?? null,
            'createdAt' => date('c'),
            'dismissedBy' => [],
        ]);

        if ($normalized === null) {
            return false;
        }

        $rows[] = $normalized;
        return $this->writeNotificationsFallback($rows);
    }

    private function activeNotificationsFallback(string $userId): array
    {
        $rows = $this->readNotificationsFallback();
        if (!$rows) {
            return [];
        }

        $now = time();
        $remaining = [];
        $items = [];

        foreach ($rows as $row) {
            $expiresAt = $row['expiresAt'] ?? null;
            if (is_string($expiresAt) && $expiresAt !== '') {
                $expiresTs = strtotime($expiresAt);
                if ($expiresTs !== false && $expiresTs <= $now) {
                    continue;
                }
            }

            $remaining[] = $row;
            if (empty($row['active'])) {
                continue;
            }

            $dismissedBy = is_array($row['dismissedBy'] ?? null) ? $row['dismissedBy'] : [];
            if (in_array($userId, $dismissedBy, true)) {
                continue;
            }

            $items[] = [
                'id' => (string)$row['id'],
                'title' => $row['title'] ?? null,
                'message' => $row['message'] ?? null,
                'bgColor' => $row['bgColor'] ?? null,
                'textColor' => $row['textColor'] ?? null,
                'durationMs' => max(2000, min(15000, (int)($row['durationMs'] ?? 5000))),
                'dismissable' => true,
                'showOnce' => !empty($row['showOnce']),
                'createdAt' => $row['createdAt'] ?? null,
            ];
        }

        if (count($remaining) !== count($rows)) {
            $this->writeNotificationsFallback($remaining);
        }

        usort($items, function (array $a, array $b): int {
            $left = strtotime((string)($a['createdAt'] ?? '')) ?: 0;
            $right = strtotime((string)($b['createdAt'] ?? '')) ?: 0;
            return $right <=> $left;
        });

        return array_slice(array_map(function (array $item) {
            unset($item['createdAt']);
            return $item;
        }, $items), 0, 20);
    }

    private function dismissNotificationFallback(string $notificationId, string $userId): void
    {
        $id = trim($notificationId);
        if ($id === '') {
            return;
        }

        $rows = $this->readNotificationsFallback();
        if (!$rows) {
            return;
        }

        $changed = false;
        $next = [];
        foreach ($rows as $row) {
            if ((string)($row['id'] ?? '') !== $id) {
                $next[] = $row;
                continue;
            }

            if (!empty($row['showOnce'])) {
                $changed = true;
                continue;
            }

            $dismissedBy = is_array($row['dismissedBy'] ?? null) ? $row['dismissedBy'] : [];
            if (!in_array($userId, $dismissedBy, true)) {
                $dismissedBy[] = $userId;
                $row['dismissedBy'] = $dismissedBy;
                $changed = true;
            }
            $next[] = $row;
        }

        if ($changed) {
            $this->writeNotificationsFallback($next);
        }
    }

    private function dismissAllNotificationsFallback(string $userId): int
    {
        $rows = $this->readNotificationsFallback();
        if (!$rows) {
            return 0;
        }

        $changed = false;
        $dismissed = 0;
        $next = [];
        foreach ($rows as $row) {
            if (!$this->isFallbackNotificationActive($row)) {
                $next[] = $row;
                continue;
            }

            $showOnce = !empty($row['showOnce']);
            if ($showOnce) {
                $changed = true;
                $dismissed++;
                continue;
            }

            $dismissedBy = is_array($row['dismissedBy'] ?? null) ? $row['dismissedBy'] : [];
            if (!in_array($userId, $dismissedBy, true)) {
                $dismissedBy[] = $userId;
                $row['dismissedBy'] = array_values(array_unique($dismissedBy));
                $changed = true;
                $dismissed++;
            }
            $next[] = $row;
        }

        if ($changed) {
            $this->writeNotificationsFallback($next);
        }

        return $dismissed;
    }

    private function deactivateNotificationsFallback(): int
    {
        $rows = $this->readNotificationsFallback();
        if (!$rows) {
            return 0;
        }

        $disabled = 0;
        foreach ($rows as &$row) {
            if (!empty($row['active'])) {
                $row['active'] = false;
                $disabled++;
            }
        }
        unset($row);

        if ($disabled > 0) {
            $this->writeNotificationsFallback($rows);
        }

        return $disabled;
    }

    private function createChat(array $body): void
    {
        $ownerId = $this->authUserId();
        $type = (string)($body['type'] ?? 'private');
        if (!in_array($type, ['private', 'group', 'saved', 'ai'], true)) {
            $type = 'private';
        }
        $name = trim((string)($body['name'] ?? ''));
        $participantIds = $body['participantIds'] ?? [];
        if (!is_array($participantIds)) {
            $participantIds = [];
        }

        $allParticipants = array_values(array_unique(array_filter(array_merge([$ownerId], $participantIds), fn ($v) => is_string($v) && $v !== '')));

        if ($type === 'group') {
            if (count($allParticipants) < 2) {
                $this->json(['error' => 'Group must have at least 2 participants'], 400);
            }
            if (count($allParticipants) > 15) {
                $this->json(['error' => 'Group participants limit is 15'], 400);
            }
        }

        if ($type === 'private' && count($allParticipants) === 2) {
            sort($allParticipants);
            $stmt = $this->db()->prepare(
                'SELECT cp1.chat_id FROM chat_participants cp1
                 JOIN chat_participants cp2 ON cp2.chat_id = cp1.chat_id
                 JOIN chats c ON c.id = cp1.chat_id
                 WHERE c.type = "private" AND cp1.user_id = ? AND cp2.user_id = ? LIMIT 1'
            );
            $stmt->execute([$allParticipants[0], $allParticipants[1]]);
            $existing = $stmt->fetchColumn();
            if ($existing) {
                $chat = $this->chatByIdForUser((string)$existing, $ownerId);
                if ($chat) {
                    $this->json($chat);
                }
            }
        }

        $chatId = $this->uuid();
        if ($this->hasChatColumn('owner_id')) {
            $stmt = $this->db()->prepare('INSERT INTO chats (id, name, type, owner_id) VALUES (?, ?, ?, ?)');
            $stmt->execute([$chatId, $name === '' ? null : $name, $type, $ownerId]);
        } else {
            $stmt = $this->db()->prepare('INSERT INTO chats (id, name, type) VALUES (?, ?, ?)');
            $stmt->execute([$chatId, $name === '' ? null : $name, $type]);
        }

        $useGroupAdmins = $type === 'group' && $this->hasChatParticipantColumn('is_admin');
        $insertParticipant = $useGroupAdmins
            ? $this->db()->prepare('INSERT INTO chat_participants (chat_id, user_id, is_admin) VALUES (?, ?, ?)')
            : $this->db()->prepare('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)');
        foreach ($allParticipants as $uid) {
            if ($useGroupAdmins) {
                $insertParticipant->execute([$chatId, $uid, strcasecmp((string)$uid, $ownerId) === 0 ? 1 : 0]);
            } else {
                $insertParticipant->execute([$chatId, $uid]);
            }
            $this->touchChatReadState($chatId, (string)$uid);
        }
        if ($type === 'group') {
            $this->ensureGroupHasAdmin($chatId, $ownerId);
        }

        $chat = $this->chatByIdForUser($chatId, $ownerId);
        $this->json($chat ?: [
            'id' => $chatId,
            'name' => $name,
            'type' => $type,
            'participants' => [],
            'updatedAt' => date('c'),
        ], 201);
    }

    private function addGroupParticipants(string $chatId, array $body): void
    {
        $actorId = $this->authUserId();
        $this->assertChatParticipant($chatId, $actorId);
        $this->ensureGroupHasAdmin($chatId, $actorId);
        $this->assertGroupAdmin($chatId, $actorId);

        $typeStmt = $this->db()->prepare('SELECT type FROM chats WHERE id = ? LIMIT 1');
        $typeStmt->execute([$chatId]);
        $chatType = strtolower((string)$typeStmt->fetchColumn());
        if ($chatType !== 'group') {
            $this->json(['error' => 'Only group chats can add participants'], 400);
        }

        $participantIdsRaw = $body['participantIds'] ?? [];
        if (!is_array($participantIdsRaw)) {
            $participantIdsRaw = [];
        }

        $participantIds = [];
        foreach ($participantIdsRaw as $value) {
            if (!is_scalar($value)) {
                continue;
            }
            $id = trim((string)$value);
            if ($id === '' || strcasecmp($id, $actorId) === 0) {
                continue;
            }
            $participantIds[] = $id;
        }
        $participantIds = array_values(array_unique($participantIds));
        if (!$participantIds) {
            $this->json(['error' => 'participantIds are required'], 400);
        }

        $placeholders = implode(',', array_fill(0, count($participantIds), '?'));

        $existingUsersStmt = $this->db()->prepare("SELECT id FROM users WHERE id IN ({$placeholders})");
        $existingUsersStmt->execute($participantIds);
        $existingUsersRows = $existingUsersStmt->fetchAll() ?: [];
        $existingUsers = [];
        foreach ($existingUsersRows as $row) {
            $id = trim((string)($row['id'] ?? ''));
            if ($id === '') {
                continue;
            }
            $existingUsers[strtolower($id)] = $id;
        }

        if (!$existingUsers) {
            $this->json(['error' => 'No valid users were found'], 400);
        }

        $alreadyStmt = $this->db()->prepare(
            "SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id IN ({$placeholders})"
        );
        $alreadyStmt->execute(array_merge([$chatId], $participantIds));
        $alreadyRows = $alreadyStmt->fetchAll() ?: [];
        $already = [];
        foreach ($alreadyRows as $row) {
            $id = trim((string)($row['user_id'] ?? ''));
            if ($id !== '') {
                $already[strtolower($id)] = true;
            }
        }

        $toAdd = [];
        foreach ($participantIds as $requestedId) {
            $key = strtolower($requestedId);
            if (!isset($existingUsers[$key]) || isset($already[$key])) {
                continue;
            }
            $toAdd[] = $existingUsers[$key];
        }

        if (!$toAdd) {
            $chat = $this->chatByIdForUser($chatId, $actorId);
            $this->json(['ok' => true, 'added' => 0, 'chat' => $chat]);
        }

        $countStmt = $this->db()->prepare('SELECT COUNT(*) FROM chat_participants WHERE chat_id = ?');
        $countStmt->execute([$chatId]);
        $currentMembersCount = (int)$countStmt->fetchColumn();
        if ($currentMembersCount + count($toAdd) > 15) {
            $this->json(['error' => 'Group participants limit is 15'], 400);
        }

        $insert = $this->hasChatParticipantColumn('is_admin')
            ? $this->db()->prepare('INSERT INTO chat_participants (chat_id, user_id, is_admin) VALUES (?, ?, 0)')
            : $this->db()->prepare('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)');
        foreach ($toAdd as $uid) {
            try {
                $insert->execute([$chatId, $uid]);
            } catch (\Throwable) {
                // ignore duplicate or race inserts
            }
            $this->touchChatReadState($chatId, (string)$uid);
        }

        $touch = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $touch->execute([$chatId]);

        $chat = $this->chatByIdForUser($chatId, $actorId);
        $this->json([
            'ok' => true,
            'added' => count($toAdd),
            'chat' => $chat,
        ]);
    }

    private function updateGroupChat(string $chatId, array $body): void
    {
        $actorId = $this->authUserId();
        $this->assertChatParticipant($chatId, $actorId);
        $this->ensureGroupHasAdmin($chatId, $actorId);
        $this->assertGroupAdmin($chatId, $actorId);

        $chatTypeStmt = $this->db()->prepare('SELECT type, name, avatar FROM chats WHERE id = ? LIMIT 1');
        $chatTypeStmt->execute([$chatId]);
        $chatRow = $chatTypeStmt->fetch() ?: null;
        if (!$chatRow) {
            $this->json(['error' => 'Not found'], 404);
        }
        if (strtolower((string)($chatRow['type'] ?? '')) !== 'group') {
            $this->json(['error' => 'Only group chats can be updated here'], 400);
        }

        $nameProvided = array_key_exists('name', $body);
        $avatarProvided = array_key_exists('avatar', $body);
        if (!$nameProvided && !$avatarProvided) {
            $this->json(['error' => 'Nothing to update'], 400);
        }

        $nextName = trim((string)($chatRow['name'] ?? ''));
        if ($nameProvided) {
            $candidateName = trim((string)($body['name'] ?? ''));
            if ($candidateName === '') {
                $this->json(['error' => 'Group name is required'], 400);
            }
            if (function_exists('mb_strlen') && mb_strlen($candidateName) > 80) {
                $this->json(['error' => 'Group name is too long'], 400);
            }
            if (!function_exists('mb_strlen') && strlen($candidateName) > 80) {
                $this->json(['error' => 'Group name is too long'], 400);
            }
            $nextName = $candidateName;
        }

        $currentAvatar = trim((string)($chatRow['avatar'] ?? ''));
        $nextAvatar = $currentAvatar;
        if ($avatarProvided) {
            if ($body['avatar'] === null) {
                $nextAvatar = '';
            } else {
                $candidateAvatar = trim((string)($body['avatar'] ?? ''));
                if ($candidateAvatar !== '' && strlen($candidateAvatar) > 2048) {
                    $this->json(['error' => 'Avatar URL is too long'], 400);
                }
                $nextAvatar = $candidateAvatar;
            }
        }

        $update = $this->db()->prepare('UPDATE chats SET name = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $update->execute([
            $nextName === '' ? null : $nextName,
            $nextAvatar === '' ? null : $nextAvatar,
            $chatId,
        ]);

        if ($currentAvatar !== '' && strcasecmp($currentAvatar, $nextAvatar) !== 0) {
            $this->deleteUploadedFileByUrl($currentAvatar, ['/uploads/group-avatars/']);
        }

        $chat = $this->chatByIdForUser($chatId, $actorId);
        $this->json([
            'ok' => true,
            'chat' => $chat,
        ]);
    }

    private function removeGroupParticipant(string $chatId, string $targetUserId): void
    {
        $actorId = $this->authUserId();
        $targetId = trim($targetUserId);
        if ($targetId === '') {
            $this->json(['error' => 'userId is required'], 400);
        }

        $this->assertChatParticipant($chatId, $actorId);
        $this->ensureGroupHasAdmin($chatId, $actorId);
        $this->assertGroupAdmin($chatId, $actorId);

        $chatTypeStmt = $this->db()->prepare('SELECT type FROM chats WHERE id = ? LIMIT 1');
        $chatTypeStmt->execute([$chatId]);
        $chatType = strtolower((string)$chatTypeStmt->fetchColumn());
        if ($chatType !== 'group') {
            $this->json(['error' => 'Only group chats can remove participants'], 400);
        }

        if (strcasecmp($targetId, $actorId) === 0) {
            $this->json(['error' => 'Use leave group action for yourself'], 400);
        }
        if ($this->hasChatColumn('owner_id')) {
            try {
                $ownerStmt = $this->db()->prepare('SELECT owner_id FROM chats WHERE id = ? LIMIT 1');
                $ownerStmt->execute([$chatId]);
                $ownerId = trim((string)$ownerStmt->fetchColumn());
                if ($ownerId !== '' && strcasecmp($ownerId, $targetId) === 0) {
                    $this->json(['error' => 'Group creator cannot be removed'], 400);
                }
            } catch (\Throwable) {
                // ignore owner check issues
            }
        }

        $targetSelect = $this->hasChatParticipantColumn('is_admin')
            ? 'SELECT user_id, is_admin FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1'
            : 'SELECT user_id, 0 AS is_admin FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1';
        $targetStmt = $this->db()->prepare($targetSelect);
        $targetStmt->execute([$chatId, $targetId]);
        $targetParticipant = $targetStmt->fetch();
        if (!$targetParticipant) {
            $this->json(['error' => 'Participant not found'], 404);
        }

        if ($this->hasChatParticipantColumn('is_admin') && (int)($targetParticipant['is_admin'] ?? 0) === 1) {
            $adminsCountStmt = $this->db()->prepare(
                'SELECT COUNT(*) FROM chat_participants WHERE chat_id = ? AND is_admin = 1'
            );
            $adminsCountStmt->execute([$chatId]);
            $adminsCount = (int)$adminsCountStmt->fetchColumn();
            if ($adminsCount <= 1) {
                $this->json(['error' => 'Group must have at least one admin'], 400);
            }
        }

        $removeStmt = $this->db()->prepare('DELETE FROM chat_participants WHERE chat_id = ? AND user_id = ?');
        $removeStmt->execute([$chatId, $targetId]);

        if ($this->ensureChatReadStateTable()) {
            try {
                $dropReadState = $this->db()->prepare('DELETE FROM chat_read_state WHERE chat_id = ? AND user_id = ?');
                $dropReadState->execute([$chatId, $targetId]);
            } catch (\Throwable) {
                // ignore read state cleanup issues
            }
        }

        $countStmt = $this->db()->prepare('SELECT COUNT(*) FROM chat_participants WHERE chat_id = ?');
        $countStmt->execute([$chatId]);
        $participantsCount = (int)$countStmt->fetchColumn();

        if ($participantsCount <= 0) {
            $this->deleteChatAvatarById($chatId);
            $cleanup = $this->db()->prepare('DELETE FROM chats WHERE id = ?');
            $cleanup->execute([$chatId]);
            $this->json(['ok' => true, 'chatDeleted' => true]);
        }

        $touch = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $touch->execute([$chatId]);
        $this->ensureGroupHasAdmin($chatId, $actorId);

        $chat = $this->chatByIdForUser($chatId, $actorId);
        $this->json([
            'ok' => true,
            'chatDeleted' => false,
            'chat' => $chat,
        ]);
    }

    private function chatById(string $chatId): void
    {
        $userId = $this->authUserId();
        $chat = $this->chatByIdForUser($chatId, $userId);
        if (!$chat) {
            $this->json(['error' => 'Not found'], 404);
        }

        $this->json($chat);
    }

    private function clearChatMessages(string $chatId): void
    {
        $userId = $this->authUserId();
        $this->assertChatParticipant($chatId, $userId);

        $typeStmt = $this->db()->prepare('SELECT type FROM chats WHERE id = ? LIMIT 1');
        $typeStmt->execute([$chatId]);
        $chatType = strtolower((string)$typeStmt->fetchColumn());

        if ($chatType === 'ai') {
            $allAiMessageIds = [];
            try {
                $allIdsStmt = $this->db()->query(
                    'SELECT m.id
                     FROM messages m
                     JOIN chats c ON c.id = m.chat_id
                     WHERE c.type = "ai"'
                );
                $allAiMessageIds = array_values(array_filter(array_map(
                    fn ($row) => (string)($row['id'] ?? ''),
                    $allIdsStmt->fetchAll() ?: []
                )));
            } catch (\Throwable) {
                $allAiMessageIds = [];
            }

            $this->deleteAttachmentFilesByMessageIds($allAiMessageIds);

            try {
                $this->db()->exec(
                    'DELETE m
                     FROM messages m
                     JOIN chats c ON c.id = m.chat_id
                     WHERE c.type = "ai"'
                );
            } catch (\Throwable) {
                // fallback for databases with restricted multi-table DELETE
                $this->db()->exec('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE type = "ai")');
            }

            if ($this->hasChatParticipantColumn('unread_count')) {
                try {
                    $this->db()->exec(
                        'UPDATE chat_participants cp
                         JOIN chats c ON c.id = cp.chat_id
                         SET cp.unread_count = 0
                         WHERE c.type = "ai"'
                    );
                } catch (\Throwable) {
                    // ignore unread sync errors
                }
            }

            if ($this->ensureChatReadStateTable()) {
                try {
                    $this->db()->exec(
                        'UPDATE chat_read_state rs
                         JOIN chats c ON c.id = rs.chat_id
                         SET rs.last_read_at = CURRENT_TIMESTAMP,
                             rs.updated_at = CURRENT_TIMESTAMP
                         WHERE c.type = "ai"'
                    );
                } catch (\Throwable) {
                    // ignore read-state sync errors
                }
            }

            try {
                $this->db()->exec('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE type = "ai"');
            } catch (\Throwable) {
                // ignore timestamp sync errors
            }

            $this->json(['ok' => true, 'scope' => 'all-ai-chats']);
        }

        $idsStmt = $this->db()->prepare('SELECT id FROM messages WHERE chat_id = ?');
        $idsStmt->execute([$chatId]);
        $messageIds = array_values(array_filter(array_map(
            fn ($row) => (string)($row['id'] ?? ''),
            $idsStmt->fetchAll() ?: []
        )));
        $this->deleteAttachmentFilesByMessageIds($messageIds);

        $stmt = $this->db()->prepare('DELETE FROM messages WHERE chat_id = ?');
        $stmt->execute([$chatId]);

        $touch = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $touch->execute([$chatId]);

        $this->json(['ok' => true]);
    }

    private function deleteChat(string $chatId, array $body): void
    {
        $userId = $this->authUserId();
        $deleteForAll = (bool)($body['deleteForAll'] ?? false);

        $this->assertChatParticipant($chatId, $userId);
        if (!$deleteForAll && $this->hasChatColumn('owner_id')) {
            try {
                $ownerCheckStmt = $this->db()->prepare('SELECT type, owner_id FROM chats WHERE id = ? LIMIT 1');
                $ownerCheckStmt->execute([$chatId]);
                $ownerRow = $ownerCheckStmt->fetch() ?: [];
                if (
                    strtolower((string)($ownerRow['type'] ?? '')) === 'group' &&
                    strcasecmp(trim((string)($ownerRow['owner_id'] ?? '')), $userId) === 0
                ) {
                    $this->json(['error' => 'Group creator cannot leave the group'], 400);
                }
            } catch (\Throwable) {
                // ignore owner check errors
            }
        }

        if ($deleteForAll) {
            $idsStmt = $this->db()->prepare('SELECT id FROM messages WHERE chat_id = ?');
            $idsStmt->execute([$chatId]);
            $messageIds = array_values(array_filter(array_map(
                fn ($row) => (string)($row['id'] ?? ''),
                $idsStmt->fetchAll() ?: []
            )));
            $this->deleteAttachmentFilesByMessageIds($messageIds);
            $this->deleteChatAvatarById($chatId);

            $stmt = $this->db()->prepare('DELETE FROM chats WHERE id = ?');
            $stmt->execute([$chatId]);
            $this->json(['ok' => true, 'deletedForAll' => true]);
        }

        $removeMe = $this->db()->prepare('DELETE FROM chat_participants WHERE chat_id = ? AND user_id = ?');
        $removeMe->execute([$chatId, $userId]);

        $countStmt = $this->db()->prepare('SELECT COUNT(*) FROM chat_participants WHERE chat_id = ?');
        $countStmt->execute([$chatId]);
        $participantsCount = (int)$countStmt->fetchColumn();

        if ($participantsCount <= 0) {
            $this->deleteChatAvatarById($chatId);
            $cleanup = $this->db()->prepare('DELETE FROM chats WHERE id = ?');
            $cleanup->execute([$chatId]);
        } else {
            $touch = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            $touch->execute([$chatId]);
        }

        $this->json(['ok' => true, 'deletedForAll' => false]);
    }

    private function setChatArchive(string $chatId, bool $archived): void
    {
        $userId = $this->authUserId();
        $this->updateParticipantFlag($chatId, $userId, 'archived', $archived ? 1 : 0);
        $this->json(['ok' => true, 'archived' => $archived]);
    }

    private function toggleChatMute(string $chatId): void
    {
        $userId = $this->authUserId();
        $this->assertChatParticipant($chatId, $userId);

        if (!$this->hasChatParticipantColumn('muted')) {
            $this->json(['ok' => true, 'muted' => false]);
        }

        $stmt = $this->db()->prepare('SELECT muted FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$chatId, $userId]);
        $current = (int)$stmt->fetchColumn();
        $next = $current ? 0 : 1;

        $this->updateParticipantFlag($chatId, $userId, 'muted', $next);
        $this->json(['ok' => true, 'muted' => (bool)$next]);
    }

    private function toggleChatPin(string $chatId): void
    {
        $userId = $this->authUserId();
        $this->assertChatParticipant($chatId, $userId);

        if (!$this->hasChatParticipantColumn('pinned')) {
            $this->json(['ok' => true, 'pinned' => false]);
        }

        $stmt = $this->db()->prepare('SELECT pinned FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$chatId, $userId]);
        $current = (int)$stmt->fetchColumn();
        $next = $current ? 0 : 1;

        $this->updateParticipantFlag($chatId, $userId, 'pinned', $next);
        $this->json(['ok' => true, 'pinned' => (bool)$next]);
    }

    private function blockInChat(string $chatId, array $body): void
    {
        $userId = $this->authUserId();
        $targetUserId = trim((string)($body['userId'] ?? ''));
        if ($targetUserId === '') {
            $this->json(['error' => 'userId is required'], 400);
        }

        $this->updateParticipantFlag($chatId, $userId, 'blocked', 1);
        $this->json(['ok' => true, 'blocked' => true, 'userId' => $targetUserId]);
    }

    private function unblockInChat(string $chatId): void
    {
        $userId = $this->authUserId();
        $this->updateParticipantFlag($chatId, $userId, 'blocked', 0);
        $this->json(['ok' => true, 'blocked' => false]);
    }

    private function updateParticipantFlag(string $chatId, string $userId, string $field, int $value): void
    {
        if (!in_array($field, ['archived', 'pinned', 'muted', 'blocked'], true)) {
            $this->json(['error' => 'Invalid field'], 400);
        }

        $this->assertChatParticipant($chatId, $userId);

        if (!$this->hasChatParticipantColumn($field)) {
            return;
        }

        $stmt = $this->db()->prepare("UPDATE chat_participants SET {$field} = ? WHERE chat_id = ? AND user_id = ?");
        $stmt->execute([$value, $chatId, $userId]);

        $touch = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $touch->execute([$chatId]);
    }

    private function assertChatParticipant(string $chatId, string $userId): void
    {
        $stmt = $this->db()->prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$chatId, $userId]);
        if (!$stmt->fetchColumn()) {
            $this->json(['error' => 'Forbidden'], 403);
        }
    }

    private function assertGroupAdmin(string $chatId, string $userId): void
    {
        if (!$this->isGroupAdmin($chatId, $userId)) {
            $this->json(['error' => 'Only group admin can do this'], 403);
        }
    }

    private function savedChat(): void
    {
        $userId = $this->authUserId();

        $stmt = $this->db()->prepare(
            'SELECT c.id
             FROM chats c
             JOIN chat_participants cp ON cp.chat_id = c.id
             WHERE c.type = "saved" AND cp.user_id = ?
             LIMIT 1'
        );
        $stmt->execute([$userId]);
        $existing = $stmt->fetchColumn();

        if (!$existing) {
            $chatId = $this->uuid();
            if ($this->hasChatColumn('owner_id')) {
                $insertChat = $this->db()->prepare('INSERT INTO chats (id, name, type, owner_id) VALUES (?, ?, "saved", ?)');
                $insertChat->execute([$chatId, 'Saved', $userId]);
            } else {
                $insertChat = $this->db()->prepare('INSERT INTO chats (id, name, type) VALUES (?, ?, "saved")');
                $insertChat->execute([$chatId, 'Saved']);
            }

            if ($this->hasChatParticipantColumn('pinned')) {
                $insertParticipant = $this->db()->prepare('INSERT INTO chat_participants (chat_id, user_id, pinned) VALUES (?, ?, 1)');
                $insertParticipant->execute([$chatId, $userId]);
            } else {
                $insertParticipant = $this->db()->prepare('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)');
                $insertParticipant->execute([$chatId, $userId]);
            }
            $this->touchChatReadState($chatId, $userId);
            $existing = $chatId;
        }

        $chat = $this->chatByIdForUser((string)$existing, $userId);
        if (!$chat) {
            $this->json(['error' => 'Not found'], 404);
        }

        $this->json($chat);
    }

    private function sendMessage(array $body): void
    {
        $userId = $this->authUserId();
        $chatId = (string)($body['chatId'] ?? '');
        $text = trim((string)($body['text'] ?? ''));
        $attachmentsInput = $body['attachments'] ?? [];
        if (!is_array($attachmentsInput)) {
            $attachmentsInput = [];
        }
        $attachments = $this->normalizeMessageAttachments($attachmentsInput);
        $replyToIdRaw = trim((string)($body['replyToId'] ?? $body['reply_to_id'] ?? ''));

        if ($chatId === '' || ($text === '' && !$attachments)) {
            $this->json(['error' => 'Invalid payload'], 400);
        }

        $check = $this->db()->prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1');
        $check->execute([$chatId, $userId]);
        if (!$check->fetchColumn()) {
            $this->json(['error' => 'Forbidden'], 403);
        }

        $replyToId = null;
        $replyTo = null;
        if ($replyToIdRaw !== '') {
            $replyTo = $this->replyPreviewForChatMessage($chatId, $replyToIdRaw);
            if ($replyTo === null) {
                $this->json(['error' => 'Reply message not found'], 400);
            }
            $replyToId = (string)$replyTo['id'];
        }

        $messageId = $this->uuid();
        $inserted = false;
        if ($replyToId !== null) {
            try {
                $insertReply = $this->db()->prepare('INSERT INTO messages (id, chat_id, user_id, text, reply_to_id) VALUES (?, ?, ?, ?, ?)');
                $insertReply->execute([$messageId, $chatId, $userId, $text, $replyToId]);
                $inserted = true;
            } catch (\Throwable) {
                $replyTo = null;
            }
        }
        if (!$inserted) {
            $insert = $this->db()->prepare('INSERT INTO messages (id, chat_id, user_id, text) VALUES (?, ?, ?, ?)');
            $insert->execute([$messageId, $chatId, $userId, $text]);
        }
        $this->saveMessageAttachments($messageId, $attachments);

        if ($this->hasChatParticipantColumn('unread_count')) {
            $incUnread = $this->db()->prepare(
                'UPDATE chat_participants SET unread_count = unread_count + 1 WHERE chat_id = ? AND user_id <> ?'
            );
            $incUnread->execute([$chatId, $userId]);
        }
        $this->touchChatReadState($chatId, $userId);

        $updateChat = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $updateChat->execute([$chatId]);
        $pushText = $text !== '' ? $text : 'Фото';
        $this->sendPushForMessage($chatId, $userId, $pushText);
        $senderPayload = $this->messageSenderPayload($userId);

        $message = [
            'id' => $messageId,
            'chatId' => $chatId,
            'userId' => $userId,
            'text' => $text,
            'attachments' => $this->attachmentPublicPayload($attachments),
            'replyTo' => $replyTo,
            'createdAt' => date('c'),
            'edited' => 0,
            'status' => 'delivered',
            'isAi' => false,
            'reactions' => ['mine' => null, 'counts' => new \stdClass()],
            'sender' => $senderPayload,
        ];

        $this->json(['message' => $message], 201);
    }

    private function markMessagesRead(array $body): void
    {
        $userId = $this->authUserId();
        $chatId = trim((string)($body['chatId'] ?? ''));
        if ($chatId === '') {
            $this->json(['error' => 'chatId is required'], 400);
        }

        $this->assertChatParticipant($chatId, $userId);

        if ($this->hasChatParticipantColumn('unread_count')) {
            $update = $this->db()->prepare(
                'UPDATE chat_participants SET unread_count = 0 WHERE chat_id = ? AND user_id = ?'
            );
            $update->execute([$chatId, $userId]);
        }
        $this->touchChatReadState($chatId, $userId);

        $this->json(['ok' => true]);
    }

    private function chatPinnedMessages(string $chatId): void
    {
        $viewerId = $this->authUserId();
        $this->assertChatParticipant($chatId, $viewerId);

        if (!$this->ensureMessagePinsTable()) {
            $this->json(['items' => []]);
        }

        $stmt = $this->db()->prepare(
            'SELECT m.id, m.chat_id as chatId, m.user_id as userId, m.text, m.created_at as createdAt, m.edited,
                    m.reply_to_id as replyToId, u.username as senderUsername, u.full_name as senderFullName, u.avatar as senderAvatar,
                    p.pinned_at as pinnedAt
             FROM chat_pinned_messages p
             JOIN messages m ON m.id = p.message_id
             LEFT JOIN users u ON u.id = m.user_id
             WHERE p.chat_id = ?
             ORDER BY p.pinned_at DESC
             LIMIT 3'
        );
        $stmt->execute([$chatId]);
        $rows = $stmt->fetchAll() ?: [];

        if (!$rows) {
            $this->json(['items' => []]);
        }

        $attachmentsByMessage = $this->attachmentsByMessageIds(array_values(array_map(
            fn ($row) => (string)($row['id'] ?? ''),
            $rows
        )));
        $replyMap = $this->replyPreviewMap(array_values(array_unique(array_filter(array_map(
            fn ($row) => trim((string)($row['replyToId'] ?? '')),
            $rows
        )))));
        $ownStatus = $this->ownMessagesStatus($chatId, $viewerId);
        $incomingStatus = $this->viewerHasUnreadMessages($chatId, $viewerId) ? 'sent' : 'read';

        $items = array_map(function (array $row) use ($viewerId, $ownStatus, $incomingStatus, $attachmentsByMessage, $replyMap): array {
            $messageId = (string)($row['id'] ?? '');
            $authorId = (string)($row['userId'] ?? '');
            $replyToId = trim((string)($row['replyToId'] ?? ''));

            return [
                'id' => $messageId,
                'chatId' => (string)($row['chatId'] ?? ''),
                'userId' => $authorId,
                'text' => (string)($row['text'] ?? ''),
                'attachments' => $attachmentsByMessage[$messageId] ?? [],
                'replyTo' => $replyToId !== '' ? ($replyMap[$replyToId] ?? null) : null,
                'createdAt' => isset($row['createdAt']) ? date('c', strtotime((string)$row['createdAt'])) : date('c'),
                'edited' => (bool)($row['edited'] ?? false),
                'status' => $authorId === $viewerId ? $ownStatus : $incomingStatus,
                'isAi' => $this->isAiMessageText((string)($row['text'] ?? '')),
                'reactions' => $this->messageReactionSummary($messageId, $viewerId),
                'pinnedAt' => isset($row['pinnedAt']) ? date('c', strtotime((string)$row['pinnedAt'])) : date('c'),
                'sender' => [
                    'id' => $authorId,
                    'username' => (string)($row['senderUsername'] ?? ''),
                    'fullName' => (string)($row['senderFullName'] ?? ''),
                    'avatar' => $row['senderAvatar'] ?? null,
                ],
            ];
        }, $rows);

        $this->json(['items' => $items]);
    }

    private function pinChatMessage(string $chatId, array $body): void
    {
        $userId = $this->authUserId();
        $this->assertChatParticipant($chatId, $userId);

        $messageId = trim((string)($body['messageId'] ?? $body['message_id'] ?? ''));
        if ($messageId === '') {
            $this->json(['error' => 'messageId is required'], 400);
        }

        $message = $this->findMessageForParticipant($messageId, $userId);
        if (!$message || (string)($message['chat_id'] ?? '') !== $chatId) {
            $this->json(['error' => 'Message not found in this chat'], 404);
        }

        if (!$this->ensureMessagePinsTable()) {
            $this->json(['error' => 'Pinned messages storage is unavailable'], 500);
        }

        $existsStmt = $this->db()->prepare(
            'SELECT 1 FROM chat_pinned_messages WHERE chat_id = ? AND message_id = ? LIMIT 1'
        );
        $existsStmt->execute([$chatId, $messageId]);
        $alreadyPinned = (bool)$existsStmt->fetchColumn();

        if (!$alreadyPinned) {
            $countStmt = $this->db()->prepare(
                'SELECT COUNT(*) FROM chat_pinned_messages WHERE chat_id = ?'
            );
            $countStmt->execute([$chatId]);
            $count = (int)$countStmt->fetchColumn();
            if ($count >= 3) {
                $this->json(['error' => 'Maximum 3 pinned messages per chat'], 409);
            }
        }

        $upsert = $this->db()->prepare(
            'INSERT INTO chat_pinned_messages (chat_id, message_id, pinned_by, pinned_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
               pinned_by = VALUES(pinned_by),
               pinned_at = CURRENT_TIMESTAMP'
        );
        $upsert->execute([$chatId, $messageId, $userId]);

        $this->chatPinnedMessages($chatId);
    }

    private function unpinChatMessage(string $chatId, string $messageId): void
    {
        $userId = $this->authUserId();
        $this->assertChatParticipant($chatId, $userId);

        if (!$this->ensureMessagePinsTable()) {
            $this->json(['items' => []]);
        }

        $delete = $this->db()->prepare(
            'DELETE FROM chat_pinned_messages WHERE chat_id = ? AND message_id = ?'
        );
        $delete->execute([$chatId, $messageId]);

        $this->chatPinnedMessages($chatId);
    }

    private function registerPushToken(array $body): void
    {
        $userId = $this->authUserId();
        $token = trim((string)($body['token'] ?? ''));
        $platform = trim((string)($body['platform'] ?? 'unknown'));
        if ($token === '') {
            $this->json(['error' => 'token is required'], 400);
        }

        if (!$this->ensurePushTokensTable()) {
            $this->json(['error' => 'Push token storage is unavailable'], 500);
        }

        $stmt = $this->db()->prepare(
            'INSERT INTO push_tokens (id, user_id, token, platform, last_seen_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                platform = VALUES(platform),
                last_seen_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([$this->uuid(), $userId, $token, $platform]);

        $this->json(['ok' => true]);
    }

    private function removePushToken(array $body): void
    {
        $userId = $this->authUserId();
        $token = trim((string)($body['token'] ?? ''));
        if (!$this->ensurePushTokensTable()) {
            $this->json(['ok' => true]);
        }

        if ($token !== '') {
            $stmt = $this->db()->prepare('DELETE FROM push_tokens WHERE user_id = ? AND token = ?');
            $stmt->execute([$userId, $token]);
        } else {
            $stmt = $this->db()->prepare('DELETE FROM push_tokens WHERE user_id = ?');
            $stmt->execute([$userId]);
        }

        $this->json(['ok' => true]);
    }

    private function storiesFeed(): void
    {
        $viewerId = $this->authUserId();
        if (!$this->ensureStoryTables()) {
            $this->json([]);
        }
        $this->cleanupExpiredStories();

        try {
            $stmt = $this->db()->prepare(
                'SELECT s.id, s.user_id, s.text, s.media_url, s.media_urls, s.created_at, s.expires_at,
                        u.username, u.full_name, u.avatar,
                        EXISTS(
                            SELECT 1
                            FROM story_views sv
                            WHERE sv.story_id = s.id AND sv.user_id = ?
                            LIMIT 1
                        ) AS is_viewed,
                        (
                            SELECT COUNT(*)
                            FROM story_views sv2
                            WHERE sv2.story_id = s.id
                        ) AS views_count
                 FROM stories s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.expires_at > CURRENT_TIMESTAMP
                 ORDER BY s.created_at DESC
                 LIMIT 200'
            );
            $stmt->execute([$viewerId]);
            $rows = $stmt->fetchAll() ?: [];
        } catch (\Throwable) {
            $stmt = $this->db()->prepare(
                'SELECT s.id, s.user_id, s.text, s.media_url, NULL AS media_urls, s.created_at, s.expires_at,
                        u.username, u.full_name, u.avatar,
                        EXISTS(
                            SELECT 1
                            FROM story_views sv
                            WHERE sv.story_id = s.id AND sv.user_id = ?
                            LIMIT 1
                        ) AS is_viewed,
                        (
                            SELECT COUNT(*)
                            FROM story_views sv2
                            WHERE sv2.story_id = s.id
                        ) AS views_count
                 FROM stories s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.expires_at > CURRENT_TIMESTAMP
                 ORDER BY s.created_at DESC
                 LIMIT 200'
            );
            $stmt->execute([$viewerId]);
            $rows = $stmt->fetchAll() ?: [];
        }

        $this->json(array_map(fn ($row) => $this->storyToPayload($row, $viewerId), $rows));
    }

    private function myStories(): void
    {
        $viewerId = $this->authUserId();
        if (!$this->ensureStoryTables()) {
            $this->json([]);
        }
        $this->cleanupExpiredStories();

        try {
            $stmt = $this->db()->prepare(
                'SELECT s.id, s.user_id, s.text, s.media_url, s.media_urls, s.created_at, s.expires_at,
                        u.username, u.full_name, u.avatar,
                        1 AS is_viewed,
                        (
                            SELECT COUNT(*)
                            FROM story_views sv2
                            WHERE sv2.story_id = s.id
                        ) AS views_count
                 FROM stories s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.user_id = ? AND s.expires_at > CURRENT_TIMESTAMP
                 ORDER BY s.created_at DESC
                 LIMIT 100'
            );
            $stmt->execute([$viewerId]);
            $rows = $stmt->fetchAll() ?: [];
        } catch (\Throwable) {
            $stmt = $this->db()->prepare(
                'SELECT s.id, s.user_id, s.text, s.media_url, NULL AS media_urls, s.created_at, s.expires_at,
                        u.username, u.full_name, u.avatar,
                        1 AS is_viewed,
                        (
                            SELECT COUNT(*)
                            FROM story_views sv2
                            WHERE sv2.story_id = s.id
                        ) AS views_count
                 FROM stories s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.user_id = ? AND s.expires_at > CURRENT_TIMESTAMP
                 ORDER BY s.created_at DESC
                 LIMIT 100'
            );
            $stmt->execute([$viewerId]);
            $rows = $stmt->fetchAll() ?: [];
        }

        $this->json(array_map(fn ($row) => $this->storyToPayload($row, $viewerId), $rows));
    }

    private function gameOnlineStatus(): void
    {
        $relative = '/game/index.html';
        $fullPath = dirname(__DIR__) . '/public' . $relative;
        $available = is_file($fullPath) && (int)filesize($fullPath) > 0;

        $this->json([
            'ok' => true,
            'available' => $available,
            'url' => $this->buildPublicUrl($relative),
        ]);
    }

    private function createStory(array $body): void
    {
        $userId = $this->authUserId();
        if (!$this->ensureStoryTables()) {
            $this->json(['error' => 'Stories storage is unavailable'], 500);
        }

        $text = trim((string)($body['text'] ?? ''));
        $mediaUrls = $this->normalizeStoryMediaUrls($body['mediaUrls'] ?? null, $body['mediaUrl'] ?? null);
        if ($text === '' && count($mediaUrls) === 0) {
            $this->json(['error' => 'Story text or mediaUrl is required'], 400);
        }
        if (count($mediaUrls) > self::STORY_MAX_MEDIA_ITEMS) {
            $this->json(['error' => 'Maximum 10 photos per status'], 400);
        }

        $storyId = $this->uuid();
        $expiresAt = date('Y-m-d H:i:s', time() + (self::STORY_LIFETIME_HOURS * 3600));
        $primaryMediaUrl = count($mediaUrls) > 0 ? $mediaUrls[0] : null;
        $mediaUrlsJson = count($mediaUrls) > 0
            ? json_encode($mediaUrls, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            : null;

        try {
            $insert = $this->db()->prepare(
                'INSERT INTO stories (id, user_id, text, media_url, media_urls, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
            );
            $insert->execute([
                $storyId,
                $userId,
                $text === '' ? null : $text,
                $primaryMediaUrl,
                $mediaUrlsJson,
                $expiresAt,
            ]);
        } catch (\Throwable) {
            $insert = $this->db()->prepare(
                'INSERT INTO stories (id, user_id, text, media_url, expires_at) VALUES (?, ?, ?, ?, ?)'
            );
            $insert->execute([
                $storyId,
                $userId,
                $text === '' ? null : $text,
                $primaryMediaUrl,
                $expiresAt,
            ]);
        }

        $this->saveStoryMediaItems($storyId, $mediaUrls);

        try {
            $stmt = $this->db()->prepare(
                'SELECT s.id, s.user_id, s.text, s.media_url, s.media_urls, s.created_at, s.expires_at,
                        u.username, u.full_name, u.avatar,
                        1 AS is_viewed,
                        0 AS views_count
                 FROM stories s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.id = ?
                 LIMIT 1'
            );
            $stmt->execute([$storyId]);
            $row = $stmt->fetch();
        } catch (\Throwable) {
            $stmt = $this->db()->prepare(
                'SELECT s.id, s.user_id, s.text, s.media_url, NULL AS media_urls, s.created_at, s.expires_at,
                        u.username, u.full_name, u.avatar,
                        1 AS is_viewed,
                        0 AS views_count
                 FROM stories s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.id = ?
                 LIMIT 1'
            );
            $stmt->execute([$storyId]);
            $row = $stmt->fetch();
        }
        if (!$row) {
            $this->json(['error' => 'Failed to create story'], 500);
        }

        $this->json(['story' => $this->storyToPayload($row, $userId)], 201);
    }

    private function viewStory(string $storyId): void
    {
        $viewerId = $this->authUserId();
        if (!$this->ensureStoryTables()) {
            $this->json(['ok' => true]);
        }
        $this->cleanupExpiredStories();

        $check = $this->db()->prepare(
            'SELECT id, user_id FROM stories WHERE id = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1'
        );
        $check->execute([$storyId]);
        $story = $check->fetch();
        if (!$story) {
            $this->json(['error' => 'Not found'], 404);
        }

        if ((string)$story['user_id'] !== $viewerId) {
            $stmt = $this->db()->prepare(
                'INSERT INTO story_views (story_id, user_id, viewed_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE viewed_at = CURRENT_TIMESTAMP'
            );
            $stmt->execute([$storyId, $viewerId]);
        }

        $this->json(['ok' => true]);
    }

    private function storyViewers(string $storyId): void
    {
        $viewerId = $this->authUserId();
        if (!$this->ensureStoryTables()) {
            $this->json(['error' => 'Not found'], 404);
        }
        $this->cleanupExpiredStories();

        $storyStmt = $this->db()->prepare('SELECT id, user_id FROM stories WHERE id = ? LIMIT 1');
        $storyStmt->execute([$storyId]);
        $story = $storyStmt->fetch();
        if (!$story) {
            $this->json(['error' => 'Not found'], 404);
        }

        $ownerId = (string)($story['user_id'] ?? '');
        if ($ownerId !== $viewerId && !$this->isCreatorMatch($viewerId)) {
            $this->json(['error' => 'Forbidden'], 403);
        }

        $stmt = $this->db()->prepare(
            'SELECT sv.user_id, sv.viewed_at, u.username, u.full_name, u.avatar
             FROM story_views sv
             JOIN users u ON u.id = sv.user_id
             WHERE sv.story_id = ?
             ORDER BY sv.viewed_at DESC
             LIMIT 500'
        );
        $stmt->execute([$storyId]);
        $rows = $stmt->fetchAll() ?: [];

        $items = array_map(static function ($row): array {
            return [
                'userId' => (string)($row['user_id'] ?? ''),
                'viewedAt' => isset($row['viewed_at']) ? date('c', strtotime((string)$row['viewed_at'])) : date('c'),
                'user' => [
                    'id' => (string)($row['user_id'] ?? ''),
                    'username' => (string)($row['username'] ?? ''),
                    'fullName' => (string)($row['full_name'] ?? ''),
                    'avatar' => $row['avatar'] ?? null,
                ],
            ];
        }, $rows);

        $this->json([
            'ok' => true,
            'count' => count($items),
            'items' => $items,
        ]);
    }

    private function deleteStory(string $storyId): void
    {
        $userId = $this->authUserId();
        if (!$this->ensureStoryTables()) {
            $this->json(['error' => 'Not found'], 404);
        }

        try {
            $stmt = $this->db()->prepare('SELECT id, user_id, media_url, media_urls FROM stories WHERE id = ? LIMIT 1');
            $stmt->execute([$storyId]);
            $story = $stmt->fetch();
        } catch (\Throwable) {
            $stmt = $this->db()->prepare('SELECT id, user_id, media_url, NULL AS media_urls FROM stories WHERE id = ? LIMIT 1');
            $stmt->execute([$storyId]);
            $story = $stmt->fetch();
        }
        if (!$story) {
            $this->json(['error' => 'Not found'], 404);
        }

        if ((string)$story['user_id'] !== $userId && !$this->isCreatorMatch($userId)) {
            $this->json(['error' => 'Forbidden'], 403);
        }

        $this->deleteStoryMediaFilesFromRow($story);

        $delete = $this->db()->prepare('DELETE FROM stories WHERE id = ?');
        $delete->execute([$storyId]);
        $this->json(['ok' => true]);
    }

    private function cleanupExpiredStories(): void
    {
        if (!$this->ensureStoryTables()) {
            return;
        }

        try {
            try {
                $stmt = $this->db()->query('SELECT id, media_url, media_urls FROM stories WHERE expires_at <= CURRENT_TIMESTAMP');
            } catch (\Throwable) {
                $stmt = $this->db()->query('SELECT id, media_url, NULL AS media_urls FROM stories WHERE expires_at <= CURRENT_TIMESTAMP');
            }
            $expired = $stmt ? ($stmt->fetchAll() ?: []) : [];
            foreach ($expired as $storyRow) {
                $this->deleteStoryMediaFilesFromRow($storyRow);
            }

            $this->db()->exec('DELETE FROM stories WHERE expires_at <= CURRENT_TIMESTAMP');
        } catch (\Throwable) {
            // ignore cleanup errors
        }
    }

    private function storyToPayload(array $row, string $viewerId): array
    {
        $mediaUrls = $this->decodeStoryMediaUrls($row);
        $storyId = (string)($row['id'] ?? '');
        $tableUrls = $this->loadStoryMediaUrls($storyId);
        foreach ($tableUrls as $url) {
            if (!in_array($url, $mediaUrls, true)) {
                $mediaUrls[] = $url;
            }
        }
        $fallbackMedia = trim((string)($row['media_url'] ?? ''));
        if ($fallbackMedia !== '' && !in_array($fallbackMedia, $mediaUrls, true)) {
            $mediaUrls[] = $fallbackMedia;
        }

        return [
            'id' => $storyId,
            'userId' => (string)($row['user_id'] ?? ''),
            'text' => $row['text'] ?? null,
            'mediaUrl' => $mediaUrls[0] ?? ($row['media_url'] ?? null),
            'mediaUrls' => $mediaUrls,
            'createdAt' => isset($row['created_at']) ? date('c', strtotime((string)$row['created_at'])) : date('c'),
            'expiresAt' => isset($row['expires_at']) ? date('c', strtotime((string)$row['expires_at'])) : null,
            'isViewed' => ((string)($row['user_id'] ?? '') === $viewerId) ? true : ((int)($row['is_viewed'] ?? 0) > 0),
            'viewsCount' => max(0, (int)($row['views_count'] ?? 0)),
            'user' => [
                'id' => (string)($row['user_id'] ?? ''),
                'username' => (string)($row['username'] ?? ''),
                'fullName' => (string)($row['full_name'] ?? ''),
                'avatar' => $row['avatar'] ?? null,
            ],
        ];
    }

    private function setMessageReaction(string $messageId, array $body): void
    {
        $userId = $this->authUserId();
        $reaction = trim((string)($body['reaction'] ?? ''));
        if ($reaction === '') {
            $this->json(['error' => 'reaction is required'], 400);
        }

        $message = $this->findMessageForParticipant($messageId, $userId);
        if (!$message) {
            $this->json(['error' => 'Not found'], 404);
        }

        if (!$this->ensureMessageReactionsTable()) {
            $this->json(['ok' => true, 'reactions' => ['mine' => $reaction, 'counts' => [$reaction => 1]]]);
        }

        $stmt = $this->db()->prepare(
            'INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE reaction = VALUES(reaction), created_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([$messageId, $userId, $reaction]);

        $this->json([
            'ok' => true,
            'messageId' => $messageId,
            'reactions' => $this->messageReactionSummary($messageId, $userId),
        ]);
    }

    private function removeMessageReaction(string $messageId): void
    {
        $userId = $this->authUserId();
        $message = $this->findMessageForParticipant($messageId, $userId);
        if (!$message) {
            $this->json(['error' => 'Not found'], 404);
        }

        if ($this->ensureMessageReactionsTable()) {
            $del = $this->db()->prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?');
            $del->execute([$messageId, $userId]);
        }

        $this->json([
            'ok' => true,
            'messageId' => $messageId,
            'reactions' => $this->messageReactionSummary($messageId, $userId),
        ]);
    }

    private function messageReactions(string $messageId): void
    {
        $viewerId = $this->authUserId();
        $message = $this->findMessageForParticipant($messageId, $viewerId);
        if (!$message) {
            $this->json(['error' => 'Not found'], 404);
        }

        if (!$this->ensureMessageReactionsTable()) {
            $this->json(['items' => []]);
        }

        $limit = (int)($_GET['limit'] ?? 300);
        if ($limit < 1) $limit = 1;
        if ($limit > 500) $limit = 500;

        $stmt = $this->db()->prepare(
            'SELECT mr.user_id, mr.reaction, mr.created_at, u.username, u.full_name, u.avatar
             FROM message_reactions mr
             JOIN users u ON u.id = mr.user_id
             WHERE mr.message_id = ?
             ORDER BY mr.created_at DESC
             LIMIT ' . $limit
        );
        $stmt->execute([$messageId]);
        $rows = $stmt->fetchAll() ?: [];
        $items = array_map(function (array $row): array {
            $userId = (string)($row['user_id'] ?? '');
            return [
                'userId' => $userId,
                'reaction' => (string)($row['reaction'] ?? ''),
                'reactedAt' => isset($row['created_at']) ? date('c', strtotime((string)$row['created_at'])) : null,
                'user' => [
                    'id' => $userId,
                    'username' => (string)($row['username'] ?? ''),
                    'fullName' => (string)($row['full_name'] ?? ''),
                    'avatar' => $row['avatar'] ?? null,
                ],
            ];
        }, $rows);

        $this->json(['items' => $items]);
    }


    private function aiChat(): void
    {
        $userId = $this->authUserId();
        $stmt = $this->db()->prepare(
            'SELECT c.id
             FROM chats c
             JOIN chat_participants cp ON cp.chat_id = c.id
             WHERE c.type = "ai" AND cp.user_id = ?
             LIMIT 1'
        );
        $stmt->execute([$userId]);
        $existing = $stmt->fetchColumn();

        if (!$existing) {
            $chatId = $this->uuid();
            if ($this->hasChatColumn('owner_id')) {
                $insertChat = $this->db()->prepare('INSERT INTO chats (id, name, type, owner_id) VALUES (?, ?, "ai", ?)');
                $insertChat->execute([$chatId, 'AI', $userId]);
            } else {
                $insertChat = $this->db()->prepare('INSERT INTO chats (id, name, type) VALUES (?, ?, "ai")');
                $insertChat->execute([$chatId, 'AI']);
            }

            if ($this->hasChatParticipantColumn('pinned')) {
                $insertParticipant = $this->db()->prepare('INSERT INTO chat_participants (chat_id, user_id, pinned) VALUES (?, ?, 1)');
                $insertParticipant->execute([$chatId, $userId]);
            } else {
                $insertParticipant = $this->db()->prepare('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)');
                $insertParticipant->execute([$chatId, $userId]);
            }
            $this->touchChatReadState($chatId, $userId);
            $existing = $chatId;
        }

        $chat = $this->chatByIdForUser((string)$existing, $userId);
        if (!$chat) {
            $this->json(['error' => 'Not found'], 404);
        }

        $this->json($chat);
    }

    private function aiMessage(array $body): void
    {
        $userId = $this->authUserId();
        $chatId = (string)($body['chatId'] ?? '');
        $text = trim((string)($body['text'] ?? ''));
        $provider = strtolower(trim((string)($body['provider'] ?? 'g4f')));
        if ($provider !== 'custom') {
            $provider = 'g4f';
        }
        $apiKey = trim((string)($body['apiKey'] ?? ''));
        $attachmentsInput = $body['attachments'] ?? [];
        if (!is_array($attachmentsInput)) {
            $attachmentsInput = [];
        }
        $attachments = $this->normalizeMessageAttachments($attachmentsInput);

        if ($chatId === '' || ($text === '' && !$attachments)) {
            $this->json(['error' => 'Invalid payload'], 400);
        }
        if ($provider === 'custom' && $apiKey === '') {
            $this->json(['error' => 'api_key_required'], 400);
        }

        $check = $this->db()->prepare('SELECT c.id FROM chats c JOIN chat_participants cp ON cp.chat_id = c.id WHERE c.id = ? AND c.type = "ai" AND cp.user_id = ? LIMIT 1');
        $check->execute([$chatId, $userId]);
        if (!$check->fetchColumn()) {
            $this->json(['error' => 'Forbidden'], 403);
        }

        $messageId = $this->uuid();
        $insert = $this->db()->prepare('INSERT INTO messages (id, chat_id, user_id, text) VALUES (?, ?, ?, ?)');
        $insert->execute([$messageId, $chatId, $userId, $text]);
        $this->saveMessageAttachments($messageId, $attachments);

        $contextStmt = $this->db()->prepare(
            'SELECT text FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 16'
        );
        $contextStmt->execute([$chatId]);
        $historyRows = array_reverse($contextStmt->fetchAll() ?: []);
        $history = array_map(fn ($row) => (string)($row['text'] ?? ''), $historyRows);

        $prompt = $text !== '' ? $text : 'Опиши изображение на фото и помоги с ним.';
        $aiReplyPayload = null;
        if ($provider === 'custom' && $apiKey !== '') {
            $aiReplyPayload = $this->fetchAiReplyFromCustomApiKey($prompt, $history, $attachments, $apiKey);
        }

        $rawReply = trim((string)($aiReplyPayload['text'] ?? ''));
        if ($rawReply === '') {
            $rawReply = trim((string)($this->fetchAiReply($prompt, $history) ?? ''));
        }
        if ($rawReply === '') {
            $rawReply = $this->composeAiReplyClean($prompt);
        }

        $aiAttachmentCandidates = [];
        if (is_array($aiReplyPayload) && isset($aiReplyPayload['attachments']) && is_array($aiReplyPayload['attachments'])) {
            $aiAttachmentCandidates = $aiReplyPayload['attachments'];
        }
        $aiAttachmentCandidates = array_merge($aiAttachmentCandidates, $this->extractImageUrlsFromText($rawReply));
        $aiAttachments = $this->normalizeAiExternalImageAttachments($aiAttachmentCandidates);

        $replyText = 'AI: ' . trim($rawReply);
        $replyId = $this->uuid();
        $insert->execute([$replyId, $chatId, $userId, $replyText]);
        $this->saveMessageAttachments($replyId, $aiAttachments);

        $updateChat = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $updateChat->execute([$chatId]);

        $this->json([
            'userMessage' => [
                'id' => $messageId,
                'chatId' => $chatId,
                'userId' => $userId,
                'text' => $text,
                'attachments' => $this->attachmentPublicPayload($attachments),
                'createdAt' => date('c'),
                'edited' => 0,
                'isAi' => false,
                'reactions' => ['mine' => null, 'counts' => new \stdClass()],
            ],
            'aiMessage' => [
                'id' => $replyId,
                'chatId' => $chatId,
                'userId' => $userId,
                'text' => $replyText,
                'attachments' => $this->attachmentPublicPayload($aiAttachments),
                'createdAt' => date('c'),
                'edited' => 0,
                'isAi' => true,
                'reactions' => ['mine' => null, 'counts' => new \stdClass()],
            ],
            'message' => $replyText,
        ], 201);
    }

    private function fetchAiReplyFromCustomApiKey(string $prompt, array $history, array $attachments, string $apiKey): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $endpoint = trim((string)Config::get('AI_CUSTOM_API_URL', 'https://api.openai.com/v1/chat/completions'));
        $model = trim((string)Config::get('AI_CUSTOM_MODEL', (string)Config::get('AI_MODEL', 'gpt-4o-mini')));
        $endpointUrl = $this->normalizeExternalUrl($endpoint);
        if ($endpointUrl === null) {
            return null;
        }

        $messages = [
            [
                'role' => 'system',
                'content' => 'Ты помощник Vibe. Отвечай кратко и по делу на русском языке.',
            ],
        ];

        $historyTail = array_slice(array_values(array_filter(array_map(static function ($item): string {
            return trim((string)$item);
        }, $history))), -6);
        foreach ($historyTail as $entry) {
            $messages[] = ['role' => 'user', 'content' => $entry];
        }

        $content = [];
        if (trim($prompt) !== '') {
            $content[] = [
                'type' => 'text',
                'text' => trim($prompt),
            ];
        }
        foreach ($attachments as $attachment) {
            if (!is_array($attachment)) {
                continue;
            }
            $type = strtolower(trim((string)($attachment['type'] ?? '')));
            if ($type !== 'image') {
                continue;
            }
            $url = $this->normalizeExternalUrl((string)($attachment['url'] ?? ''));
            if ($url === null) {
                continue;
            }
            $content[] = [
                'type' => 'image_url',
                'image_url' => ['url' => $url],
            ];
        }

        if (!$content) {
            return null;
        }

        if (count($content) === 1 && ($content[0]['type'] ?? '') === 'text') {
            $messages[] = ['role' => 'user', 'content' => (string)($content[0]['text'] ?? '')];
        } else {
            $messages[] = ['role' => 'user', 'content' => $content];
        }

        $payload = json_encode(
            [
                'model' => $model !== '' ? $model : 'gpt-4o-mini',
                'messages' => $messages,
                'temperature' => 0.4,
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        if ($payload === false) {
            return null;
        }

        $ch = curl_init($endpointUrl);
        if ($ch === false) {
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 70,
            CURLOPT_POSTFIELDS => $payload,
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if (!is_string($response) || $httpCode < 200 || $httpCode >= 300) {
            return null;
        }

        $data = json_decode($response, true);
        if (!is_array($data)) {
            return null;
        }

        $text = '';
        $rawContent = $data['choices'][0]['message']['content'] ?? null;
        if (is_string($rawContent)) {
            $text = trim($rawContent);
        } elseif (is_array($rawContent)) {
            $parts = [];
            foreach ($rawContent as $part) {
                if (!is_array($part)) continue;
                $type = strtolower(trim((string)($part['type'] ?? '')));
                if ($type === 'text') {
                    $value = trim((string)($part['text'] ?? ''));
                    if ($value !== '') {
                        $parts[] = $value;
                    }
                }
            }
            $text = trim(implode("\n", $parts));
        }

        if ($text === '') {
            $text = trim((string)($data['output_text'] ?? ''));
        }

        $attachmentsFromResponse = $this->extractImageUrlsFromText($text);
        if (isset($data['data']) && is_array($data['data'])) {
            foreach ($data['data'] as $row) {
                if (!is_array($row)) continue;
                $url = $this->normalizeExternalUrl((string)($row['url'] ?? ''));
                if ($url !== null) {
                    $attachmentsFromResponse[] = $url;
                }
            }
        }

        return [
            'text' => $text,
            'attachments' => $attachmentsFromResponse,
        ];
    }

    private function extractImageUrlsFromText(string $text): array
    {
        $source = trim($text);
        if ($source === '') {
            return [];
        }

        if (!preg_match_all('~https?://[^\s<>"\')]+~iu', $source, $matches)) {
            return [];
        }

        $items = [];
        foreach (($matches[0] ?? []) as $rawUrl) {
            $url = $this->normalizeExternalUrl((string)$rawUrl);
            if ($url === null) {
                continue;
            }
            $path = strtolower((string)parse_url($url, PHP_URL_PATH));
            $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            $isImage = in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'], true);
            if (!$isImage) {
                $hint = strtolower($url);
                $isImage = strpos($hint, 'image') !== false || strpos($hint, 'img') !== false || strpos($hint, 'photo') !== false;
            }
            if ($isImage) {
                $items[] = $url;
            }
        }

        return array_values(array_unique($items));
    }

    private function normalizeAiExternalImageAttachments(array $rawUrls): array
    {
        $result = [];
        $seen = [];

        foreach ($rawUrls as $item) {
            $candidate = '';
            if (is_array($item)) {
                $candidate = (string)($item['url'] ?? '');
            } else {
                $candidate = (string)$item;
            }
            $url = $this->normalizeExternalUrl($candidate);
            if ($url === null || isset($seen[$url])) {
                continue;
            }
            $seen[$url] = true;
            $path = (string)parse_url($url, PHP_URL_PATH);
            $name = basename($path);
            if ($name === '' || $name === '/' || $name === '.') {
                $name = 'ai-image-' . (count($result) + 1) . '.jpg';
            }
            $result[] = [
                'id' => $this->uuid(),
                'name' => $name,
                'url' => $url,
                'type' => 'image',
                'size' => 0,
            ];
        }

        return $result;
    }

    private function composeAiReply(string $text): string
    {
        if (preg_match('/\\b(hello|hi|РїСЂРёРІРµС‚)\\b/ui', $text)) {
            return 'РџСЂРёРІРµС‚! Р§РµРј РјРѕРіСѓ РїРѕРјРѕС‡СЊ?';
        }
        if (preg_match('/\\b(help|РїРѕРјРѕРіРё|С‡С‚Рѕ СѓРјРµРµС€СЊ)\\b/ui', $text)) {
            return 'Я Vibe AI. Могу подсказать, объяснить и помочь с идеями.';
        }

        return 'РЇ РїРѕР»СѓС‡РёР» СЃРѕРѕР±С‰РµРЅРёРµ. Р Р°СЃСЃРєР°Р¶Рё РїРѕРґСЂРѕР±РЅРµРµ, Рё СЏ РїРѕСЃС‚Р°СЂР°СЋСЃСЊ РїРѕРјРѕС‡СЊ.';
    }

    private function composeAiReplyClean(string $text): string
    {
        if (preg_match('/\b(hello|hi|привет|здравствуй)\b/ui', $text)) {
            return 'Привет! Я AI-помощник Vibe. Чем могу помочь?';
        }
        if (preg_match('/\b(help|помоги|что умеешь)\b/ui', $text)) {
            return 'Я могу отвечать на вопросы, помогать с идеями и объяснять сложные вещи простыми словами.';
        }
        return 'Я получил сообщение. Уточни запрос, и я постараюсь помочь максимально точно.';
    }

    private function fetchAiReply(string $prompt, array $history): ?string
    {
        $fromConfigured = $this->fetchAiReplyFromConfiguredService($prompt, $history);
        if ($fromConfigured !== null) {
            return $fromConfigured;
        }

        $fromPollinations = $this->fetchAiReplyFromPollinations($prompt, $history);
        if ($fromPollinations !== null) {
            return $fromPollinations;
        }

        return null;
    }

    private function fetchAiReplyFromConfiguredService(string $prompt, array $history): ?string
    {
        $endpoint = trim((string)Config::get('AI_SERVICE_URL', ''));
        if ($endpoint === '') {
            return null;
        }
        if (!function_exists('curl_init')) {
            return null;
        }

        $payload = json_encode(
            [
                'prompt' => $prompt,
                'history' => $history,
                'model' => (string)Config::get('AI_MODEL', 'gpt-4o-mini'),
            ],
            JSON_UNESCAPED_UNICODE
        );
        if ($payload === false) {
            return null;
        }

        $ch = curl_init($endpoint);
        if ($ch === false) {
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_POSTFIELDS => $payload,
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $httpCode < 200 || $httpCode >= 300) {
            return null;
        }

        $data = json_decode((string)$response, true);
        if (!is_array($data)) {
            return null;
        }

        $text = trim((string)($data['answer'] ?? $data['text'] ?? $data['message'] ?? ''));
        return $text !== '' ? $text : null;
    }

    private function fetchAiReplyFromPollinations(string $prompt, array $history): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $historyTail = array_slice(array_values(array_filter(array_map(static function ($item): string {
            return trim((string)$item);
        }, $history))), -8);
        $context = trim(implode("\n", $historyTail));
        $requestText = trim($context !== '' ? ($context . "\n\nUser: " . $prompt) : $prompt);
        if ($requestText === '') {
            return null;
        }

        $url = 'https://text.pollinations.ai/prompt/' . rawurlencode($requestText);
        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_HTTPGET => true,
            CURLOPT_HTTPHEADER => [
                'Accept: text/plain, application/json;q=0.9, */*;q=0.8',
                'User-Agent: Vibe-AI/1.0',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 45,
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if (!is_string($response) || $httpCode < 200 || $httpCode >= 300) {
            return null;
        }

        $decoded = json_decode($response, true);
        if (is_array($decoded)) {
            $response = (string)($decoded['text'] ?? $decoded['answer'] ?? $decoded['message'] ?? '');
        }

        $text = trim((string)$response);
        if ($text === '') {
            return null;
        }

        if (function_exists('mb_strlen') && function_exists('mb_substr')) {
            if (mb_strlen($text, 'UTF-8') > 3000) {
                $text = mb_substr($text, 0, 3000, 'UTF-8');
            }
        } elseif (strlen($text) > 3000) {
            $text = substr($text, 0, 3000);
        }

        return $text !== '' ? $text : null;
    }

    private function deleteMessage(string $messageId, array $body): void
    {
        $userId = $this->authUserId();
        $deleteForAll = (bool)($body['deleteForAll'] ?? false);

        $stmt = $this->db()->prepare('SELECT id, chat_id, user_id FROM messages WHERE id = ? LIMIT 1');
        $stmt->execute([$messageId]);
        $message = $stmt->fetch();
        if (!$message) {
            $this->json(['error' => 'Not found'], 404);
        }

        $part = $this->db()->prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1');
        $part->execute([$message['chat_id'], $userId]);
        if (!$part->fetchColumn()) {
            $this->json(['error' => 'Forbidden'], 403);
        }

        if ($deleteForAll && $message['user_id'] !== $userId) {
            $this->json(['error' => 'Delete for all is allowed only for own messages'], 403);
        }

        $this->deleteAttachmentFilesByMessageIds([$messageId]);

        // Delete message and refresh chat activity timestamp.
        $del = $this->db()->prepare('DELETE FROM messages WHERE id = ?');
        $del->execute([$messageId]);

        $updateChat = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $updateChat->execute([$message['chat_id']]);

        $this->json(['ok' => true]);
    }

    private function editMessage(string $messageId, array $body): void
    {
        $userId = $this->authUserId();
        $text = trim((string)($body['text'] ?? ''));
        if ($text === '') {
            $this->json(['error' => 'Text is required'], 400);
        }

        $stmt = $this->db()->prepare('SELECT id, chat_id, user_id, created_at FROM messages WHERE id = ? LIMIT 1');
        $stmt->execute([$messageId]);
        $message = $stmt->fetch();
        if (!$message) {
            $this->json(['error' => 'Not found'], 404);
        }

        if ((string)$message['user_id'] !== $userId) {
            $this->json(['error' => 'Only own messages can be edited'], 403);
        }

        try {
            $windowStmt = $this->db()->prepare(
                'SELECT 1 FROM messages WHERE id = ? AND created_at >= (CURRENT_TIMESTAMP - INTERVAL 15 MINUTE) LIMIT 1'
            );
            $windowStmt->execute([$messageId]);
            if (!$windowStmt->fetchColumn()) {
                $this->json(['error' => 'Editing window (15 minutes) has expired'], 403);
            }
        } catch (\Throwable) {
            // Fallback check if DB interval expression is unavailable.
            $createdAtTs = strtotime((string)($message['created_at'] ?? ''));
            if ($createdAtTs === false || (time() - $createdAtTs) > 900) {
                $this->json(['error' => 'Editing window (15 minutes) has expired'], 403);
            }
        }

        $part = $this->db()->prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1');
        $part->execute([$message['chat_id'], $userId]);
        if (!$part->fetchColumn()) {
            $this->json(['error' => 'Forbidden'], 403);
        }

        $update = $this->db()->prepare('UPDATE messages SET text = ?, edited = 1 WHERE id = ?');
        $update->execute([$text, $messageId]);

        $chatUpdate = $this->db()->prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $chatUpdate->execute([$message['chat_id']]);

        $this->json([
            'ok' => true,
            'message' => [
                'id' => $messageId,
                'chatId' => (string)$message['chat_id'],
                'userId' => $userId,
                'text' => $text,
                'edited' => 1,
                'editedAt' => date('c'),
            ],
        ]);
    }

    private function me(): void
    {
        $userId = $this->authUserId();
        $this->ensureUserProfileColumns();
        $select = 'SELECT id, username, full_name, bio, avatar, status, last_seen';
        if ($this->hasUserColumn('birth_date')) {
            $select .= ', birth_date';
        }
        $select .= ' FROM users WHERE id = ? LIMIT 1';
        $stmt = $this->db()->prepare($select);
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        if (!$u) {
            $this->json(['error' => 'Not found'], 404);
        }

        $presence = $this->normalizePresence((string)($u['status'] ?? 'offline'), $u['last_seen'] ?? null);

        $this->json([
            'id' => $u['id'],
            'username' => $u['username'],
            'fullName' => $u['full_name'],
            'bio' => $u['bio'] ?? null,
            'avatar' => $u['avatar'] ?? null,
            'status' => $presence['status'],
            'lastSeen' => $presence['lastSeen'],
            'birthday' => $u['birth_date'] ?? null,
            'isCreator' => $this->isCreatorMatch((string)$u['id']),
        ]);
    }

    private function updateMe(array $body): void
    {
        $userId = $this->authUserId();
        $this->ensureUserProfileColumns();
        $fullName = trim((string)($body['fullName'] ?? ''));
        $bio = trim((string)($body['bio'] ?? ''));
        $avatar = trim((string)($body['avatar'] ?? ''));
        $birthdayRaw = trim((string)($body['birthday'] ?? $body['birthDate'] ?? $body['birth_date'] ?? ''));
        $birthDate = null;
        if ($birthdayRaw !== '') {
            $birthDate = $this->normalizeBirthDateValue($birthdayRaw);
            if ($birthDate === null) {
                $this->json(['error' => 'Invalid birthday format'], 400);
            }
        }

        $existingStmt = $this->db()->prepare('SELECT full_name, avatar FROM users WHERE id = ? LIMIT 1');
        $existingStmt->execute([$userId]);
        $existing = $existingStmt->fetch() ?: [];
        $previousAvatar = trim((string)($existing['avatar'] ?? ''));

        if ($fullName === '') {
            $fullName = (string)($existing['full_name'] ?? '');
        }

        $avatarToStore = $avatar === '' ? null : $avatar;
        if ($this->hasUserColumn('birth_date')) {
            $stmt = $this->db()->prepare('UPDATE users SET full_name = ?, bio = ?, avatar = ?, birth_date = ? WHERE id = ?');
            $stmt->execute([$fullName, $bio === '' ? null : $bio, $avatarToStore, $birthDate, $userId]);
        } else {
            $stmt = $this->db()->prepare('UPDATE users SET full_name = ?, bio = ?, avatar = ? WHERE id = ?');
            $stmt->execute([$fullName, $bio === '' ? null : $bio, $avatarToStore, $userId]);
        }

        if ($previousAvatar !== '' && strcasecmp($previousAvatar, (string)($avatarToStore ?? '')) !== 0) {
            $this->deleteUploadedFileByUrl($previousAvatar, ['/uploads/avatars/']);
        }
        $this->me();
    }

    private function meNotificationSettings(): void
    {
        $userId = $this->authUserId();
        $privateChats = true;
        $groupChats = true;

        if ($this->ensureUserNotificationColumns()) {
            try {
                $stmt = $this->db()->prepare(
                    'SELECT notify_private_chats, notify_group_chats FROM users WHERE id = ? LIMIT 1'
                );
                $stmt->execute([$userId]);
                $row = $stmt->fetch() ?: [];
                $privateChats = ((int)($row['notify_private_chats'] ?? 1)) !== 0;
                $groupChats = ((int)($row['notify_group_chats'] ?? 1)) !== 0;
            } catch (\Throwable) {
                // keep defaults when DB is temporarily unavailable
            }
        }

        $this->json([
            'privateChats' => $privateChats,
            'groupChats' => $groupChats,
        ]);
    }

    private function updateMeNotificationSettings(array $body): void
    {
        $userId = $this->authUserId();
        $hasPrivate = array_key_exists('privateChats', $body);
        $hasGroup = array_key_exists('groupChats', $body);

        if (!$hasPrivate && !$hasGroup) {
            $this->json(['error' => 'Invalid payload'], 400);
        }

        $privateChats = $hasPrivate ? (bool)$body['privateChats'] : null;
        $groupChats = $hasGroup ? (bool)$body['groupChats'] : null;

        if (!$this->ensureUserNotificationColumns()) {
            $this->json([
                'ok' => true,
                'privateChats' => $privateChats ?? true,
                'groupChats' => $groupChats ?? true,
                'persisted' => false,
            ]);
        }

        try {
            $stmt = $this->db()->prepare(
                'SELECT notify_private_chats, notify_group_chats FROM users WHERE id = ? LIMIT 1'
            );
            $stmt->execute([$userId]);
            $row = $stmt->fetch() ?: [];
            $nextPrivate = $privateChats ?? (((int)($row['notify_private_chats'] ?? 1)) !== 0);
            $nextGroup = $groupChats ?? (((int)($row['notify_group_chats'] ?? 1)) !== 0);

            $update = $this->db()->prepare(
                'UPDATE users
                 SET notify_private_chats = ?, notify_group_chats = ?
                 WHERE id = ?'
            );
            $update->execute([
                $nextPrivate ? 1 : 0,
                $nextGroup ? 1 : 0,
                $userId,
            ]);

            $this->json([
                'ok' => true,
                'privateChats' => $nextPrivate,
                'groupChats' => $nextGroup,
                'persisted' => true,
            ]);
        } catch (\Throwable) {
            $this->json(['error' => 'Failed to update notification settings'], 500);
        }
    }

    private function searchUsers(): void
    {
        $this->authUserId();
        $this->ensureUserProfileColumns();
        $q = trim((string)($_GET['q'] ?? ''));
        if ($q === '' || strlen($q) < 2) {
            $this->json([]);
        }

        $like = '%' . $q . '%';
        $select = 'SELECT id, username, full_name, bio, avatar, status, last_seen';
        if ($this->hasUserColumn('birth_date')) {
            $select .= ', birth_date';
        }
        $select .= ' FROM users WHERE username LIKE ? OR full_name LIKE ? ORDER BY updated_at DESC LIMIT 30';
        $stmt = $this->db()->prepare($select);
        $stmt->execute([$like, $like]);
        $rows = $stmt->fetchAll();
        $result = array_map(function ($u) {
            $presence = $this->normalizePresence((string)($u['status'] ?? 'offline'), $u['last_seen'] ?? null);

            return [
                'id' => $u['id'],
                'username' => $u['username'],
                'fullName' => $u['full_name'],
                'bio' => $u['bio'] ?? null,
                'avatar' => $u['avatar'] ?? null,
                'status' => $presence['status'],
                'lastSeen' => $presence['lastSeen'],
                'birthday' => $u['birth_date'] ?? null,
            ];
        }, $rows ?: []);

        $this->json($result);
    }

    private function userByUsername(string $username): void
    {
        $this->authUserId();
        $this->ensureUserProfileColumns();
        $u = trim($username);
        if ($u === '') {
            $this->json(['error' => 'Not found'], 404);
        }

        $select = 'SELECT id, username, full_name, bio, avatar, status, last_seen';
        if ($this->hasUserColumn('birth_date')) {
            $select .= ', birth_date';
        }
        $select .= ' FROM users WHERE username = ? LIMIT 1';
        $stmt = $this->db()->prepare($select);
        $stmt->execute([$u]);
        $row = $stmt->fetch();
        if (!$row) {
            $this->json(['error' => 'Not found'], 404);
        }

        $presence = $this->normalizePresence((string)($row['status'] ?? 'offline'), $row['last_seen'] ?? null);

        $this->json([
            'id' => $row['id'],
            'username' => $row['username'],
            'fullName' => $row['full_name'],
            'bio' => $row['bio'] ?? null,
            'avatar' => $row['avatar'] ?? null,
            'status' => $presence['status'],
            'lastSeen' => $presence['lastSeen'],
            'birthday' => $row['birth_date'] ?? null,
            'isCreator' => $this->isCreatorMatch((string)$row['id']),
        ]);
    }

    private function userById(string $id): void
    {
        $this->authUserId();
        $this->ensureUserProfileColumns();
        $select = 'SELECT id, username, full_name, bio, avatar, status, last_seen';
        if ($this->hasUserColumn('birth_date')) {
            $select .= ', birth_date';
        }
        $select .= ' FROM users WHERE id = ? LIMIT 1';
        $stmt = $this->db()->prepare($select);
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            $this->json(['error' => 'Not found'], 404);
        }

        $presence = $this->normalizePresence((string)($row['status'] ?? 'offline'), $row['last_seen'] ?? null);

        $this->json([
            'id' => $row['id'],
            'username' => $row['username'],
            'fullName' => $row['full_name'],
            'bio' => $row['bio'] ?? null,
            'avatar' => $row['avatar'] ?? null,
            'status' => $presence['status'],
            'lastSeen' => $presence['lastSeen'],
            'birthday' => $row['birth_date'] ?? null,
            'isCreator' => $this->isCreatorMatch((string)$row['id']),
        ]);
    }

    private function chatMessages(string $chatId): void
    {
        $userId = $this->authUserId();
        $this->assertChatParticipant($chatId, $userId);
        $limitRaw = (int)($_GET['limit'] ?? 50);
        $offsetRaw = (int)($_GET['offset'] ?? 0);
        $limit = max(1, min(500, $limitRaw > 0 ? $limitRaw : 50));
        $offset = max(0, $offsetRaw);

        try {
            $stmt = $this->db()->prepare(
                'SELECT m.id, m.chat_id as chatId, m.user_id as userId, m.text, m.created_at as createdAt, m.edited,
                        m.reply_to_id as replyToId, u.username as senderUsername, u.full_name as senderFullName, u.avatar as senderAvatar
                 FROM messages m
                 LEFT JOIN users u ON u.id = m.user_id
                 WHERE m.chat_id = ?
                 ORDER BY m.created_at DESC, m.id DESC
                 LIMIT ?
                 OFFSET ?'
            );
            $stmt->bindValue(1, $chatId);
            $stmt->bindValue(2, $limit, PDO::PARAM_INT);
            $stmt->bindValue(3, $offset, PDO::PARAM_INT);
            $stmt->execute();
        } catch (\Throwable) {
            $stmt = $this->db()->prepare(
                'SELECT m.id, m.chat_id as chatId, m.user_id as userId, m.text, m.created_at as createdAt, m.edited,
                        NULL as replyToId, u.username as senderUsername, u.full_name as senderFullName, u.avatar as senderAvatar
                 FROM messages m
                 LEFT JOIN users u ON u.id = m.user_id
                 WHERE m.chat_id = ?
                 ORDER BY m.created_at DESC, m.id DESC
                 LIMIT ?
                 OFFSET ?'
            );
            $stmt->bindValue(1, $chatId);
            $stmt->bindValue(2, $limit, PDO::PARAM_INT);
            $stmt->bindValue(3, $offset, PDO::PARAM_INT);
            $stmt->execute();
        }
        $rows = array_reverse($stmt->fetchAll() ?: []);
        $attachmentsByMessage = $this->attachmentsByMessageIds(array_values(array_map(
            fn ($row) => (string)($row['id'] ?? ''),
            $rows
        )));
        $replyMap = $this->replyPreviewMap(array_values(array_unique(array_filter(array_map(
            fn ($row) => trim((string)($row['replyToId'] ?? '')),
            $rows
        )))));
        $ownStatus = $this->ownMessagesStatus($chatId, $userId);
        $incomingStatus = $this->viewerHasUnreadMessages($chatId, $userId) ? 'sent' : 'read';

        $payload = array_map(function ($row) use ($userId, $ownStatus, $incomingStatus, $attachmentsByMessage, $replyMap) {
            $text = (string)($row['text'] ?? '');
            $isAi = $this->isAiMessageText($text);
            $authorId = (string)($row['userId'] ?? '');
            $messageId = (string)($row['id'] ?? '');
            $replyToId = trim((string)($row['replyToId'] ?? ''));
            return [
                'id' => $messageId,
                'chatId' => $row['chatId'],
                'userId' => $row['userId'],
                'text' => $text,
                'attachments' => $attachmentsByMessage[$messageId] ?? [],
                'replyTo' => $replyToId !== '' ? ($replyMap[$replyToId] ?? null) : null,
                'createdAt' => isset($row['createdAt']) ? date('c', strtotime((string)$row['createdAt'])) : date('c'),
                'edited' => (bool)($row['edited'] ?? false),
                'status' => $authorId === $userId ? $ownStatus : $incomingStatus,
                'isAi' => $isAi,
                'reactions' => $this->messageReactionSummary($messageId, $userId),
                'sender' => [
                    'id' => $authorId,
                    'username' => (string)($row['senderUsername'] ?? ''),
                    'fullName' => (string)($row['senderFullName'] ?? ''),
                    'avatar' => $row['senderAvatar'] ?? null,
                ],
            ];
        }, $rows);

        $this->json($payload);
    }

    private function chatByIdForUser(string $chatId, string $userId): ?array
    {
        $metaSelect = $this->chatParticipantMetaSelectSql();

        $stmt = $this->db()->prepare(
            "SELECT c.id, c.name, c.type, c.avatar, c.updated_at,
"
            . "                    {$metaSelect}
"
            . "             FROM chats c
"
            . "             JOIN chat_participants cp ON cp.chat_id = c.id
"
            . "             WHERE c.id = ? AND cp.user_id = ?
"
            . "             LIMIT 1"
        );
        $stmt->execute([$chatId, $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        if (strtolower((string)($row['type'] ?? '')) === 'group') {
            $this->ensureGroupHasAdmin($chatId, $userId);
            $stmt->execute([$chatId, $userId]);
            $row = $stmt->fetch() ?: $row;
        }

        return $this->buildChatPayload($row, $userId);
    }

    private function buildChatPayload(array $row, string $viewerId): array
    {
        if (strtolower((string)($row['type'] ?? '')) === 'group') {
            $chatId = (string)($row['id'] ?? '');
            $this->ensureGroupHasAdmin($chatId, $viewerId);
            if ($this->hasChatParticipantColumn('is_admin')) {
                try {
                    $viewerAdminStmt = $this->db()->prepare(
                        'SELECT is_admin FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1'
                    );
                    $viewerAdminStmt->execute([$chatId, $viewerId]);
                    $row['is_admin'] = (int)$viewerAdminStmt->fetchColumn();
                } catch (\Throwable) {
                    // ignore admin-role refresh errors
                }
            }
        }

        $participants = $this->chatParticipants((string)$row['id'], $viewerId, (string)$row['type']);
        $last = $this->chatLastMessage((string)$row['id'], $viewerId);

        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'avatar' => $row['avatar'],
            'participants' => $participants,
            'archived' => (bool)$row['archived'],
            'pinned' => (bool)$row['pinned'],
            'muted' => (bool)$row['muted'],
            'blocked' => (bool)$row['blocked'],
            'isAdmin' => (bool)($row['is_admin'] ?? false),
            'unreadCount' => $this->resolveUnreadCount((string)$row['id'], $viewerId, $row),
            'lastMessage' => $last,
            'lastMessageText' => $last['text'] ?? '',
            'lastMessageTime' => $last['createdAt'] ?? null,
            'lastMessageUserId' => $last['userId'] ?? null,
            'lastMessageStatus' => $last['status'] ?? null,
            'updatedAt' => isset($row['updated_at']) ? date('c', strtotime((string)$row['updated_at'])) : null,
        ];
    }

    private function resolveUnreadCount(string $chatId, string $viewerId, array $row): int
    {
        if (strtolower((string)($row['type'] ?? '')) === 'saved') {
            return 0;
        }

        $fromReadState = $this->unreadCountFromReadStateOrNull($chatId, $viewerId);
        if ($fromReadState !== null) {
            $this->syncUnreadCountColumn($chatId, $viewerId, $fromReadState);
            return $fromReadState;
        }

        if ($this->hasChatParticipantColumn('unread_count') && array_key_exists('unread_count', $row)) {
            return max(0, (int)$row['unread_count']);
        }

        return 0;
    }

    private function unreadCountFromReadState(string $chatId, string $userId): int
    {
        return max(0, (int)($this->unreadCountFromReadStateOrNull($chatId, $userId) ?? 0));
    }

    private function unreadCountFromReadStateOrNull(string $chatId, string $userId): ?int
    {
        if (!$this->ensureChatReadStateTable()) {
            return null;
        }

        try {
            $stateStmt = $this->db()->prepare(
                'SELECT last_read_at FROM chat_read_state WHERE chat_id = ? AND user_id = ? LIMIT 1'
            );
            $stateStmt->execute([$chatId, $userId]);
            $lastReadAt = $stateStmt->fetchColumn();

            if (!$lastReadAt) {
                if ($this->hasChatParticipantColumn('unread_count')) {
                    $cpStmt = $this->db()->prepare(
                        'SELECT unread_count FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1'
                    );
                    $cpStmt->execute([$chatId, $userId]);
                    $cpValue = $cpStmt->fetchColumn();
                    if ($cpValue !== false) {
                        $unread = max(0, (int)$cpValue);
                        if ($unread === 0) {
                            $this->touchChatReadState($chatId, $userId);
                        }
                        return $unread;
                    }
                }

                $this->touchChatReadState($chatId, $userId);
                return 0;
            }

            $countStmt = $this->db()->prepare(
                'SELECT COUNT(*) FROM messages WHERE chat_id = ? AND user_id <> ? AND created_at > ?'
            );
            $countStmt->execute([$chatId, $userId, (string)$lastReadAt]);
            return max(0, (int)$countStmt->fetchColumn());
        } catch (\Throwable) {
            return null;
        }
    }

    private function syncUnreadCountColumn(string $chatId, string $userId, int $unreadCount): void
    {
        if (!$this->hasChatParticipantColumn('unread_count')) {
            return;
        }

        try {
            $stmt = $this->db()->prepare(
                'UPDATE chat_participants SET unread_count = ? WHERE chat_id = ? AND user_id = ?'
            );
            $stmt->execute([max(0, $unreadCount), $chatId, $userId]);
        } catch (\Throwable) {
            // ignore sync errors
        }
    }

    private function viewerHasUnreadMessages(string $chatId, string $viewerId): bool
    {
        $fromReadState = $this->unreadCountFromReadStateOrNull($chatId, $viewerId);
        if ($fromReadState !== null) {
            $this->syncUnreadCountColumn($chatId, $viewerId, $fromReadState);
            return $fromReadState > 0;
        }

        if ($this->hasChatParticipantColumn('unread_count')) {
            try {
                $stmt = $this->db()->prepare(
                    'SELECT unread_count FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1'
                );
                $stmt->execute([$chatId, $viewerId]);
                return ((int)$stmt->fetchColumn()) > 0;
            } catch (\Throwable) {
                return false;
            }
        }

        return $this->unreadCountFromReadState($chatId, $viewerId) > 0;
    }

    private function ownMessagesStatus(string $chatId, string $authorId): string
    {
        if ($this->ensureChatReadStateTable()) {
            return $this->hasUnreadForPeersByReadState($chatId, $authorId) ? 'delivered' : 'read';
        }

        if ($this->hasChatParticipantColumn('unread_count')) {
            try {
                $stmt = $this->db()->prepare(
                    'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id <> ? AND unread_count > 0 LIMIT 1'
                );
                $stmt->execute([$chatId, $authorId]);
                return $stmt->fetchColumn() ? 'delivered' : 'read';
            } catch (\Throwable) {
                return 'delivered';
            }
        }

        return $this->hasUnreadForPeersByReadState($chatId, $authorId) ? 'delivered' : 'read';
    }

    private function chatParticipants(string $chatId, string $viewerId, string $chatType): array
    {
        if ($chatType === 'saved') {
            return [];
        }

        $adminSelect = $this->hasChatParticipantColumn('is_admin')
            ? 'cp.is_admin AS is_admin,'
            : '0 AS is_admin,';
        $stmt = $this->db()->prepare(
            "SELECT u.id, u.username, u.full_name, u.avatar, u.bio, u.status, u.last_seen, {$adminSelect} u.badge
             FROM chat_participants cp
             JOIN users u ON u.id = cp.user_id
             WHERE cp.chat_id = ? AND cp.user_id <> ?"
        );
        $stmt->execute([$chatId, $viewerId]);

        $rows = $stmt->fetchAll();
        return array_map(function ($u) {
            $presence = $this->normalizePresence((string)($u['status'] ?? 'offline'), $u['last_seen'] ?? null);

            return [
                'id' => $u['id'],
                'username' => $u['username'],
                'fullName' => $u['full_name'],
                'avatar' => $u['avatar'] ?? null,
                'bio' => $u['bio'] ?? null,
                'status' => $presence['status'],
                'lastSeen' => $presence['lastSeen'],
                'badge' => $u['badge'] ?? null,
                'isAdmin' => (bool)($u['is_admin'] ?? false),
            ];
        }, $rows ?: []);
    }

    private function chatLastMessage(string $chatId, string $viewerId): ?array
    {
        try {
            $stmt = $this->db()->prepare(
                'SELECT m.id, m.chat_id, m.user_id, m.text, m.created_at, m.edited, m.reply_to_id,
                        u.username as senderUsername, u.full_name as senderFullName, u.avatar as senderAvatar
                 FROM messages m
                 LEFT JOIN users u ON u.id = m.user_id
                 WHERE m.chat_id = ?
                 ORDER BY m.created_at DESC
                 LIMIT 1'
            );
            $stmt->execute([$chatId]);
        } catch (\Throwable) {
            $stmt = $this->db()->prepare(
                'SELECT m.id, m.chat_id, m.user_id, m.text, m.created_at, m.edited,
                        u.username as senderUsername, u.full_name as senderFullName, u.avatar as senderAvatar
                 FROM messages m
                 LEFT JOIN users u ON u.id = m.user_id
                 WHERE m.chat_id = ?
                 ORDER BY m.created_at DESC
                 LIMIT 1'
            );
            $stmt->execute([$chatId]);
        }
        $m = $stmt->fetch();
        if (!$m) {
            return null;
        }
        $messageId = (string)$m['id'];
        $attachmentsByMessage = $this->attachmentsByMessageIds([$messageId]);
        $replyToId = trim((string)($m['reply_to_id'] ?? ''));
        $replyMap = $replyToId !== '' ? $this->replyPreviewMap([$replyToId]) : [];

        $status = 'sent';
        $authorId = (string)$m['user_id'];
        if ($authorId === $viewerId) {
            $status = $this->ownMessagesStatus($chatId, $viewerId);
        } else {
            $status = $this->viewerHasUnreadMessages($chatId, $viewerId) ? 'sent' : 'read';
        }

        return [
            'id' => $messageId,
            'chatId' => $m['chat_id'],
            'userId' => $m['user_id'],
            'text' => $m['text'],
            'attachments' => $attachmentsByMessage[$messageId] ?? [],
            'replyTo' => $replyToId !== '' ? ($replyMap[$replyToId] ?? null) : null,
            'createdAt' => date('c', strtotime((string)$m['created_at'])),
            'edited' => (bool)$m['edited'],
            'status' => $status,
            'isAi' => $this->isAiMessageText((string)($m['text'] ?? '')),
            'reactions' => $this->messageReactionSummary($messageId, $viewerId),
            'sender' => [
                'id' => $authorId,
                'username' => (string)($m['senderUsername'] ?? ''),
                'fullName' => (string)($m['senderFullName'] ?? ''),
                'avatar' => $m['senderAvatar'] ?? null,
            ],
        ];
    }

    private function normalizeStoryMediaUrls(mixed $mediaUrlsInput, mixed $singleMediaUrlInput): array
    {
        $urls = [];
        if (is_array($mediaUrlsInput)) {
            foreach ($mediaUrlsInput as $raw) {
                $value = trim((string)$raw);
                if ($value === '') {
                    continue;
                }
                $urls[] = $value;
            }
        }

        $single = trim((string)$singleMediaUrlInput);
        if ($single !== '') {
            $urls[] = $single;
        }

        $allowedPrefixes = ['/uploads/stories/'];
        $normalized = [];
        foreach ($urls as $value) {
            $relative = $this->extractUploadsRelativePath($value);
            if ($relative === null) {
                continue;
            }
            $allowed = false;
            foreach ($allowedPrefixes as $prefix) {
                if ($this->startsWith($relative, $prefix)) {
                    $allowed = true;
                    break;
                }
            }
            if (!$allowed || in_array($value, $normalized, true)) {
                continue;
            }
            $normalized[] = $value;
            if (count($normalized) >= self::STORY_MAX_MEDIA_ITEMS) {
                break;
            }
        }

        return $normalized;
    }

    private function decodeStoryMediaUrls(array $row): array
    {
        $raw = $row['media_urls'] ?? null;
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $result = [];
        foreach ($decoded as $item) {
            $value = trim((string)$item);
            if ($value === '' || in_array($value, $result, true)) {
                continue;
            }
            $result[] = $value;
            if (count($result) >= self::STORY_MAX_MEDIA_ITEMS) {
                break;
            }
        }

        return $result;
    }

    private function deleteStoryMediaFilesFromRow(array $storyRow): void
    {
        $urls = $this->decodeStoryMediaUrls($storyRow);
        $storyId = trim((string)($storyRow['id'] ?? ''));
        foreach ($this->loadStoryMediaUrls($storyId) as $urlFromTable) {
            if (!in_array($urlFromTable, $urls, true)) {
                $urls[] = $urlFromTable;
            }
        }
        $single = trim((string)($storyRow['media_url'] ?? ''));
        if ($single !== '' && !in_array($single, $urls, true)) {
            $urls[] = $single;
        }

        foreach ($urls as $url) {
            $this->deleteUploadedFileByUrl($url, ['/uploads/stories/']);
        }
    }

    private function saveStoryMediaItems(string $storyId, array $mediaUrls): void
    {
        if ($storyId === '' || !$this->ensureStoryMediaTable()) {
            return;
        }

        try {
            $clearStmt = $this->db()->prepare('DELETE FROM story_media WHERE story_id = ?');
            $clearStmt->execute([$storyId]);

            if (!$mediaUrls) {
                return;
            }

            $insertStmt = $this->db()->prepare(
                'INSERT INTO story_media (id, story_id, media_url, position) VALUES (?, ?, ?, ?)'
            );
            foreach (array_values($mediaUrls) as $index => $url) {
                $normalized = trim((string)$url);
                if ($normalized === '') {
                    continue;
                }
                $insertStmt->execute([
                    $this->uuid(),
                    $storyId,
                    $normalized,
                    (int)$index,
                ]);
            }
        } catch (\Throwable) {
            // keep story creation working even when media index table is unavailable
        }
    }

    private function loadStoryMediaUrls(string $storyId): array
    {
        if ($storyId === '' || !$this->ensureStoryMediaTable()) {
            return [];
        }

        try {
            $stmt = $this->db()->prepare(
                'SELECT media_url
                 FROM story_media
                 WHERE story_id = ?
                 ORDER BY position ASC, created_at ASC'
            );
            $stmt->execute([$storyId]);
            $rows = $stmt->fetchAll() ?: [];
            $result = [];
            foreach ($rows as $row) {
                $url = trim((string)($row['media_url'] ?? ''));
                if ($url === '' || in_array($url, $result, true)) {
                    continue;
                }
                $result[] = $url;
                if (count($result) >= self::STORY_MAX_MEDIA_ITEMS) {
                    break;
                }
            }
            return $result;
        } catch (\Throwable) {
            return [];
        }
    }

    private function messageSenderPayload(string $userId): array
    {
        $id = trim($userId);
        if ($id === '') {
            return [
                'id' => '',
                'username' => '',
                'fullName' => '',
                'avatar' => null,
            ];
        }

        try {
            $stmt = $this->db()->prepare('SELECT username, full_name, avatar FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch() ?: [];
            return [
                'id' => $id,
                'username' => (string)($row['username'] ?? ''),
                'fullName' => (string)($row['full_name'] ?? ''),
                'avatar' => $row['avatar'] ?? null,
            ];
        } catch (\Throwable) {
            return [
                'id' => $id,
                'username' => '',
                'fullName' => '',
                'avatar' => null,
            ];
        }
    }

    private function normalizeMessageAttachments(array $attachments): array
    {
        $result = [];
        foreach ($attachments as $item) {
            if (!is_array($item)) continue;
            $normalized = $this->normalizeMessageAttachment($item);
            if ($normalized) {
                $result[] = $normalized;
            }
        }
        return $result;
    }

    private function normalizeMessageAttachment(array $item): ?array
    {
        $url = trim((string)($item['url'] ?? ''));
        if ($url === '') {
            return null;
        }

        $relative = $this->extractUploadsRelativePath($url);
        if ($relative === null || !$this->startsWith($relative, '/uploads/messages/')) {
            return null;
        }

        $fullPath = dirname(__DIR__) . '/public' . $relative;
        if (!is_file($fullPath)) {
            return null;
        }

        $id = trim((string)($item['id'] ?? ''));
        if ($id === '') {
            $id = $this->uuid();
        }

        $name = trim((string)($item['name'] ?? ''));
        if ($name === '') {
            $name = basename($fullPath);
        }

        $size = (int)($item['size'] ?? 0);
        if ($size <= 0) {
            $detectedSize = filesize($fullPath);
            $size = is_int($detectedSize) && $detectedSize > 0 ? $detectedSize : 0;
        }

        $type = trim((string)($item['type'] ?? ''));
        if ($type === '') {
            $type = $this->attachmentTypeFromPath($fullPath);
        }

        return [
            'id' => $id,
            'name' => $name,
            'url' => $this->buildPublicUrl($relative),
            'type' => $type !== '' ? $type : 'file',
            'size' => max(0, $size),
        ];
    }

    private function saveMessageAttachments(string $messageId, array $attachments): void
    {
        if (!$attachments || !$this->ensureAttachmentsTable()) {
            return;
        }

        $stmt = $this->db()->prepare(
            'INSERT INTO attachments (id, message_id, name, url, type, size) VALUES (?, ?, ?, ?, ?, ?)'
        );

        foreach ($attachments as $attachment) {
            try {
                $stmt->execute([
                    (string)($attachment['id'] ?? $this->uuid()),
                    $messageId,
                    (string)($attachment['name'] ?? 'file'),
                    (string)($attachment['url'] ?? ''),
                    (string)($attachment['type'] ?? 'file'),
                    (int)($attachment['size'] ?? 0),
                ]);
            } catch (\Throwable) {
                // keep message even if one attachment failed to persist
            }
        }
    }

    private function attachmentPublicPayload(array $attachments): array
    {
        return array_map(
            fn ($item) => [
                'id' => (string)($item['id'] ?? ''),
                'name' => (string)($item['name'] ?? ''),
                'url' => (string)($item['url'] ?? ''),
                'type' => (string)($item['type'] ?? 'file'),
                'size' => (int)($item['size'] ?? 0),
            ],
            $attachments
        );
    }

    private function attachmentsByMessageIds(array $messageIds): array
    {
        $ids = array_values(array_filter(array_map('strval', $messageIds), fn ($id) => $id !== ''));
        if (!$ids || !$this->ensureAttachmentsTable()) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db()->prepare(
            "SELECT id, message_id, name, url, type, size FROM attachments WHERE message_id IN ({$placeholders}) ORDER BY id ASC"
        );
        $stmt->execute($ids);
        $rows = $stmt->fetchAll() ?: [];

        $grouped = [];
        foreach ($rows as $row) {
            $messageId = (string)($row['message_id'] ?? '');
            if ($messageId === '') continue;
            if (!isset($grouped[$messageId])) {
                $grouped[$messageId] = [];
            }
            $grouped[$messageId][] = [
                'id' => (string)($row['id'] ?? ''),
                'name' => (string)($row['name'] ?? ''),
                'url' => (string)($row['url'] ?? ''),
                'type' => (string)($row['type'] ?? 'file'),
                'size' => (int)($row['size'] ?? 0),
            ];
        }

        return $grouped;
    }

    private function replyPreviewForChatMessage(string $chatId, string $replyToId): ?array
    {
        $replyId = trim($replyToId);
        if ($replyId === '') {
            return null;
        }
        $map = $this->replyPreviewMap([$replyId], $chatId);
        return $map[$replyId] ?? null;
    }

    private function replyPreviewMap(array $messageIds, ?string $chatId = null): array
    {
        $ids = array_values(array_filter(array_map('strval', $messageIds), fn ($id) => trim($id) !== ''));
        if (!$ids) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $params = $ids;
        $sql = "SELECT m.id, m.text, u.full_name
                FROM messages m
                LEFT JOIN users u ON u.id = m.user_id
                WHERE m.id IN ({$placeholders})";
        if ($chatId !== null && trim($chatId) !== '') {
            $sql .= ' AND m.chat_id = ?';
            $params[] = trim($chatId);
        }

        try {
            $stmt = $this->db()->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll() ?: [];
        } catch (\Throwable) {
            return [];
        }

        $map = [];
        foreach ($rows as $row) {
            $id = trim((string)($row['id'] ?? ''));
            if ($id === '') continue;

            $text = trim((string)($row['text'] ?? ''));
            if ($text === '') {
                $text = 'Вложение';
            }
            if (function_exists('mb_strlen') && function_exists('mb_substr')) {
                if (mb_strlen($text) > 160) {
                    $text = mb_substr($text, 0, 157) . '...';
                }
            } elseif (strlen($text) > 160) {
                $text = substr($text, 0, 157) . '...';
            }

            $fullName = trim((string)($row['full_name'] ?? ''));
            $map[$id] = [
                'id' => $id,
                'text' => $text,
                'fullName' => $fullName !== '' ? $fullName : null,
            ];
        }

        return $map;
    }

    private function findMessageForParticipant(string $messageId, string $userId): ?array
    {
        $stmt = $this->db()->prepare(
            'SELECT m.id, m.chat_id
             FROM messages m
             JOIN chat_participants cp ON cp.chat_id = m.chat_id
             WHERE m.id = ? AND cp.user_id = ?
             LIMIT 1'
        );
        $stmt->execute([$messageId, $userId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function hasUnreadForPeersByReadState(string $chatId, string $authorId): bool
    {
        if (!$this->ensureChatReadStateTable()) {
            return false;
        }

        try {
            $stmt = $this->db()->prepare(
                'SELECT 1
                 FROM chat_participants cp
                 WHERE cp.chat_id = ? AND cp.user_id <> ?
                   AND EXISTS (
                     SELECT 1
                     FROM messages m
                     WHERE m.chat_id = cp.chat_id
                       AND m.user_id = ?
                       AND m.created_at > COALESCE(
                         (SELECT rs.last_read_at
                          FROM chat_read_state rs
                          WHERE rs.chat_id = cp.chat_id AND rs.user_id = cp.user_id
                          LIMIT 1),
                         "1970-01-01 00:00:00"
                       )
                   )
                 LIMIT 1'
            );
            $stmt->execute([$chatId, $authorId, $authorId]);
            return (bool)$stmt->fetchColumn();
        } catch (\Throwable) {
            return false;
        }
    }

    private function touchChatReadState(string $chatId, string $userId): void
    {
        if (!$this->ensureChatReadStateTable()) {
            return;
        }

        try {
            $stmt = $this->db()->prepare(
                'INSERT INTO chat_read_state (chat_id, user_id, last_read_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE
                   last_read_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP'
            );
            $stmt->execute([$chatId, $userId]);
        } catch (\Throwable) {
            // ignore read state write errors
        }
    }

    private function isGroupAdmin(string $chatId, string $userId): bool
    {
        if (!$this->hasChatParticipantColumn('is_admin')) {
            return true;
        }

        try {
            $stmt = $this->db()->prepare(
                'SELECT is_admin FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1'
            );
            $stmt->execute([$chatId, $userId]);
            return ((int)$stmt->fetchColumn()) === 1;
        } catch (\Throwable) {
            return false;
        }
    }

    private function ensureGroupHasAdmin(string $chatId, ?string $preferredUserId = null): void
    {
        if (!$this->hasChatParticipantColumn('is_admin')) {
            return;
        }

        try {
            $ownerId = '';
            if ($this->hasChatColumn('owner_id')) {
                $ownerStmt = $this->db()->prepare('SELECT owner_id FROM chats WHERE id = ? LIMIT 1');
                $ownerStmt->execute([$chatId]);
                $ownerId = trim((string)$ownerStmt->fetchColumn());
            }

            $preferred = trim((string)$preferredUserId);
            if ($ownerId === '' && $preferred !== '' && $this->hasChatColumn('owner_id')) {
                try {
                    $setOwnerStmt = $this->db()->prepare('UPDATE chats SET owner_id = ? WHERE id = ?');
                    $setOwnerStmt->execute([$preferred, $chatId]);
                    $ownerId = $preferred;
                } catch (\Throwable) {
                    $ownerId = '';
                }
            }

            if ($ownerId !== '') {
                $ownerParticipantStmt = $this->db()->prepare(
                    'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1'
                );
                $ownerParticipantStmt->execute([$chatId, $ownerId]);
                if ($ownerParticipantStmt->fetchColumn()) {
                    $enforceOwnerStmt = $this->db()->prepare(
                        'UPDATE chat_participants
                         SET is_admin = CASE WHEN user_id = ? THEN 1 ELSE 0 END
                         WHERE chat_id = ?'
                    );
                    $enforceOwnerStmt->execute([$ownerId, $chatId]);
                    return;
                }
            }

            $countAdminsStmt = $this->db()->prepare(
                'SELECT COUNT(*) FROM chat_participants WHERE chat_id = ? AND is_admin = 1'
            );
            $countAdminsStmt->execute([$chatId]);
            if ((int)$countAdminsStmt->fetchColumn() > 0) {
                return;
            }

            $targetUserId = '';
            if ($preferred !== '') {
                $checkPreferredStmt = $this->db()->prepare(
                    'SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id = ? LIMIT 1'
                );
                $checkPreferredStmt->execute([$chatId, $preferred]);
                $preferredFound = trim((string)$checkPreferredStmt->fetchColumn());
                if ($preferredFound !== '') {
                    $targetUserId = $preferredFound;
                }
            }

            if ($targetUserId === '') {
                $firstStmt = $this->db()->prepare(
                    'SELECT user_id FROM chat_participants WHERE chat_id = ? ORDER BY user_id ASC LIMIT 1'
                );
                $firstStmt->execute([$chatId]);
                $targetUserId = trim((string)$firstStmt->fetchColumn());
            }

            if ($targetUserId === '') {
                return;
            }

            $promoteStmt = $this->db()->prepare(
                'UPDATE chat_participants SET is_admin = 1 WHERE chat_id = ? AND user_id = ?'
            );
            $promoteStmt->execute([$chatId, $targetUserId]);
        } catch (\Throwable) {
            // ignore migration/permission issues
        }
    }

    private function ensureChatReadStateTable(): bool
    {
        if ($this->chatReadStateTableReady !== null) {
            return $this->chatReadStateTableReady;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS chat_read_state (
                    chat_id CHAR(36) NOT NULL,
                    user_id CHAR(36) NOT NULL,
                    last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (chat_id, user_id),
                    KEY idx_chat_read_state_user (user_id),
                    CONSTRAINT fk_read_state_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                    CONSTRAINT fk_read_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
            $this->chatReadStateTableReady = true;
        } catch (\Throwable) {
            $this->chatReadStateTableReady = false;
        }

        return $this->chatReadStateTableReady;
    }

    private function ensureAttachmentsTable(): bool
    {
        if ($this->attachmentsTableReady !== null) {
            return $this->attachmentsTableReady;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS attachments (
                    id CHAR(36) PRIMARY KEY,
                    message_id CHAR(36) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    url VARCHAR(2048) NOT NULL,
                    type VARCHAR(64) NOT NULL,
                    size INT NOT NULL DEFAULT 0,
                    KEY idx_attachments_message (message_id),
                    CONSTRAINT fk_att_msg FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
            $this->attachmentsTableReady = true;
        } catch (\Throwable) {
            $this->attachmentsTableReady = false;
        }

        return $this->attachmentsTableReady;
    }

    private function ensureMessageReactionsTable(): bool
    {
        if ($this->messageReactionTableReady !== null) {
            return $this->messageReactionTableReady;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS message_reactions (
                    message_id CHAR(36) NOT NULL,
                    user_id CHAR(36) NOT NULL,
                    reaction VARCHAR(32) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (message_id, user_id),
                    KEY idx_message_reactions_message (message_id),
                    CONSTRAINT fk_reaction_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                    CONSTRAINT fk_reaction_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
            $this->messageReactionTableReady = true;
        } catch (\Throwable) {
            $this->messageReactionTableReady = false;
        }

        return $this->messageReactionTableReady;
    }

    private function ensureMessagePinsTable(): bool
    {
        if ($this->messagePinsTableReady !== null) {
            return $this->messagePinsTableReady;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS chat_pinned_messages (
                    chat_id CHAR(36) NOT NULL,
                    message_id CHAR(36) NOT NULL,
                    pinned_by CHAR(36) NOT NULL,
                    pinned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (chat_id, message_id),
                    KEY idx_chat_pins_chat (chat_id, pinned_at),
                    KEY idx_chat_pins_message (message_id),
                    CONSTRAINT fk_chat_pin_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                    CONSTRAINT fk_chat_pin_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                    CONSTRAINT fk_chat_pin_user FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
            $this->messagePinsTableReady = true;
        } catch (\Throwable) {
            $this->messagePinsTableReady = false;
        }

        return $this->messagePinsTableReady;
    }

    private function messageReactionSummary(string $messageId, string $viewerId): array
    {
        if (!$this->ensureMessageReactionsTable()) {
            return ['mine' => null, 'counts' => new \stdClass()];
        }

        $mineStmt = $this->db()->prepare(
            'SELECT reaction FROM message_reactions WHERE message_id = ? AND user_id = ? LIMIT 1'
        );
        $mineStmt->execute([$messageId, $viewerId]);
        $mine = $mineStmt->fetchColumn();

        $countsStmt = $this->db()->prepare(
            'SELECT reaction, COUNT(*) as total
             FROM message_reactions
             WHERE message_id = ?
             GROUP BY reaction'
        );
        $countsStmt->execute([$messageId]);
        $rows = $countsStmt->fetchAll() ?: [];
        $counts = [];
        foreach ($rows as $row) {
            $key = (string)($row['reaction'] ?? '');
            if ($key === '') continue;
            $counts[$key] = (int)($row['total'] ?? 0);
        }

        return [
            'mine' => $mine !== false ? (string)$mine : null,
            'counts' => $counts ?: new \stdClass(),
        ];
    }

    private function isAiMessageText(string $text): bool
    {
        return stripos(trim($text), 'AI:') === 0;
    }

    private function sendPushForMessage(string $chatId, string $senderId, string $messageText): void
    {
        $serverKey = trim((string)Config::get('FCM_SERVER_KEY', ''));
        $firebaseV1 = $this->firebaseV1Credentials();
        $canUseV1 = $firebaseV1 !== null;
        $canUseLegacy = $serverKey !== '';
        if ((!$canUseV1 && !$canUseLegacy) || !function_exists('curl_init')) {
            return;
        }
        if (!$this->ensurePushTokensTable()) {
            return;
        }

        try {
            $chatStmt = $this->db()->prepare('SELECT type, name FROM chats WHERE id = ? LIMIT 1');
            $chatStmt->execute([$chatId]);
            $chat = $chatStmt->fetch();
            if (!$chat) {
                return;
            }

            $chatType = (string)($chat['type'] ?? '');
            if ($chatType === 'saved' || $chatType === 'ai') {
                return;
            }

            $recipientsStmt = $this->db()->prepare(
                'SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id <> ?'
            );
            $recipientsStmt->execute([$chatId, $senderId]);
            $recipientRows = $recipientsStmt->fetchAll() ?: [];
            $recipientIds = array_values(array_filter(array_map(
                fn ($row) => (string)($row['user_id'] ?? ''),
                $recipientRows
            )));
            if (!$recipientIds) {
                return;
            }

            $allowedRecipientIds = $recipientIds;
            if ($this->ensureUserNotificationColumns()) {
                try {
                    $prefPlaceholders = implode(',', array_fill(0, count($recipientIds), '?'));
                    $prefStmt = $this->db()->prepare(
                        "SELECT id, notify_private_chats, notify_group_chats
                         FROM users
                         WHERE id IN ({$prefPlaceholders})"
                    );
                    $prefStmt->execute($recipientIds);
                    $prefRows = $prefStmt->fetchAll() ?: [];
                    $prefByUser = [];
                    foreach ($prefRows as $prefRow) {
                        $prefByUser[(string)($prefRow['id'] ?? '')] = $prefRow;
                    }

                    $allowedRecipientIds = [];
                    foreach ($recipientIds as $recipientId) {
                        $pref = $prefByUser[$recipientId] ?? null;
                        if (!$pref) {
                            $allowedRecipientIds[] = $recipientId;
                            continue;
                        }
                        $allow = $chatType === 'group'
                            ? ((int)($pref['notify_group_chats'] ?? 1) !== 0)
                            : ((int)($pref['notify_private_chats'] ?? 1) !== 0);
                        if ($allow) {
                            $allowedRecipientIds[] = $recipientId;
                        }
                    }
                } catch (\Throwable) {
                    // fall back to sending notifications to all recipients
                    $allowedRecipientIds = $recipientIds;
                }
            }
            if (!$allowedRecipientIds) {
                return;
            }

            $placeholders = implode(',', array_fill(0, count($allowedRecipientIds), '?'));
            $tokenStmt = $this->db()->prepare("SELECT user_id, token, platform FROM push_tokens WHERE user_id IN ({$placeholders})");
            $tokenStmt->execute($allowedRecipientIds);
            $tokenRows = $tokenStmt->fetchAll() ?: [];
            $tokenPayloadRows = [];
            $seenTokens = [];
            foreach ($tokenRows as $row) {
                $token = trim((string)($row['token'] ?? ''));
                $recipientUserId = trim((string)($row['user_id'] ?? ''));
                if ($token === '' || $recipientUserId === '' || isset($seenTokens[$token])) {
                    continue;
                }
                $seenTokens[$token] = true;
                $tokenPayloadRows[] = [
                    'token' => $token,
                    'userId' => $recipientUserId,
                    'platform' => trim((string)($row['platform'] ?? '')),
                ];
            }
            if (!$tokenPayloadRows) {
                return;
            }

            $senderStmt = $this->db()->prepare('SELECT full_name, username FROM users WHERE id = ? LIMIT 1');
            $senderStmt->execute([$senderId]);
            $sender = $senderStmt->fetch() ?: [];

            $senderName = trim((string)($sender['full_name'] ?? ''));
            if ($senderName === '') {
                $senderUsername = trim((string)($sender['username'] ?? ''));
                $senderName = $senderUsername !== '' ? '@' . $senderUsername : 'Vibe';
            }

            $normalizedBody = trim(preg_replace('/\s+/u', ' ', $messageText) ?? '');
            if ($normalizedBody === '') {
                $normalizedBody = 'Новое сообщение';
            }
            if (function_exists('mb_strlen') && function_exists('mb_substr')) {
                if (mb_strlen($normalizedBody) > 140) {
                    $normalizedBody = mb_substr($normalizedBody, 0, 137) . '...';
                }
            } elseif (strlen($normalizedBody) > 140) {
                $normalizedBody = substr($normalizedBody, 0, 137) . '...';
            }

            $unreadByUser = [];
            foreach ($allowedRecipientIds as $recipientId) {
                $unreadByUser[$recipientId] = $this->unreadCountFromReadState($chatId, $recipientId);
            }

            if ($canUseV1 && $firebaseV1 !== null) {
                $accessToken = $this->firebaseAccessToken($firebaseV1);
                if ($accessToken !== null) {
                    foreach ($tokenPayloadRows as $tokenRow) {
                        $token = $tokenRow['token'];
                        $badge = max(0, (int)($unreadByUser[$tokenRow['userId']] ?? 0));
                        $message = [
                            'message' => [
                                'token' => $token,
                                'notification' => [
                                    'title' => $senderName,
                                    'body' => $normalizedBody,
                                ],
                                'data' => [
                                    'type' => 'message',
                                    'chatId' => $chatId,
                                    'senderId' => $senderId,
                                ],
                                'android' => [
                                    'priority' => 'high',
                                    'notification' => [
                                        'channel_id' => 'messages',
                                        'icon' => 'ic_stat_vibe',
                                        'sound' => 'default',
                                    ],
                                ],
                                'apns' => [
                                    'headers' => [
                                        'apns-priority' => '10',
                                    ],
                                    'payload' => [
                                        'aps' => [
                                            'badge' => $badge,
                                            'sound' => 'default',
                                            'content-available' => 1,
                                        ],
                                    ],
                                ],
                            ],
                        ];

                        $result = $this->sendFcmV1Payload($accessToken, $firebaseV1['projectId'], $message);
                        if (!$result['ok'] && (int)($result['status'] ?? 0) === 401) {
                            $this->firebaseAccessTokenCache = null;
                            $refreshed = $this->firebaseAccessToken($firebaseV1);
                            if ($refreshed !== null) {
                                $result = $this->sendFcmV1Payload($refreshed, $firebaseV1['projectId'], $message);
                            }
                        }

                        $errorCode = strtoupper((string)($result['errorCode'] ?? ''));
                        if ($this->isInvalidPushTokenError($errorCode)) {
                            $this->deletePushTokenByValue($token);
                        }
                    }
                    return;
                }
            }

            if (!$canUseLegacy) {
                return;
            }

            foreach (array_chunk($tokenPayloadRows, 500) as $chunkRows) {
                $chunkTokens = array_values(array_map(
                    fn ($row) => (string)$row['token'],
                    $chunkRows
                ));
                $payload = [
                    'registration_ids' => $chunkTokens,
                    'priority' => 'high',
                    'notification' => [
                        'title' => $senderName,
                        'body' => $normalizedBody,
                        'icon' => 'ic_stat_vibe',
                        'sound' => 'default',
                    ],
                    'data' => [
                        'type' => 'message',
                        'chatId' => $chatId,
                        'senderId' => $senderId,
                    ],
                    'content_available' => true,
                    'mutable_content' => true,
                ];

                $legacyResult = $this->sendFcmPayload($serverKey, $payload);
                $results = $legacyResult['response']['results'] ?? [];
                if (!is_array($results)) {
                    $results = [];
                }
                foreach ($results as $index => $result) {
                    if (!is_array($result)) {
                        continue;
                    }
                    $errorCode = strtoupper((string)($result['error'] ?? ''));
                    if ($this->isInvalidPushTokenError($errorCode) && isset($chunkTokens[$index])) {
                        $this->deletePushTokenByValue($chunkTokens[$index]);
                    }
                }
            }
        } catch (\Throwable) {
            // ignore push failures
        }
    }

    private function sendAdminEventPush(array $event): array
    {
        $serverKey = trim((string)Config::get('FCM_SERVER_KEY', ''));
        $firebaseV1 = $this->firebaseV1Credentials();
        $canUseV1 = $firebaseV1 !== null;
        $canUseLegacy = $serverKey !== '';

        if ((!$canUseV1 && !$canUseLegacy) || !function_exists('curl_init')) {
            return [
                'ok' => false,
                'sent' => 0,
                'error' => 'Push-уведомления не настроены на сервере.',
            ];
        }
        if (!$this->ensurePushTokensTable()) {
            return [
                'ok' => false,
                'sent' => 0,
                'error' => 'Таблица push_tokens недоступна.',
            ];
        }

        try {
            $tokenStmt = $this->db()->query(
                "SELECT user_id, token, platform
                 FROM push_tokens
                 WHERE token IS NOT NULL AND token <> ''"
            );
            $tokenRows = $tokenStmt ? ($tokenStmt->fetchAll() ?: []) : [];
            $tokenPayloadRows = [];
            $seenTokens = [];
            foreach ($tokenRows as $row) {
                $token = trim((string)($row['token'] ?? ''));
                if ($token === '' || isset($seenTokens[$token])) {
                    continue;
                }
                $seenTokens[$token] = true;
                $tokenPayloadRows[] = [
                    'token' => $token,
                    'userId' => trim((string)($row['user_id'] ?? '')),
                    'platform' => trim((string)($row['platform'] ?? '')),
                ];
            }
            if (!$tokenPayloadRows) {
                return ['ok' => true, 'sent' => 0];
            }

            $title = trim((string)($event['title'] ?? 'Vibe'));
            if ($title === '') {
                $title = 'Vibe';
            }
            $body = trim((string)($event['message'] ?? ''));
            if ($body === '') {
                $body = 'Откройте приложение Vibe';
            }
            if (function_exists('mb_strlen') && function_exists('mb_substr')) {
                if (mb_strlen($body) > 160) {
                    $body = mb_substr($body, 0, 157) . '...';
                }
            } elseif (strlen($body) > 160) {
                $body = substr($body, 0, 157) . '...';
            }

            $template = strtolower(trim((string)($event['template'] ?? 'custom')));
            if ($template !== 'update') {
                $template = 'custom';
            }
            $downloadUrl = $this->normalizeExternalUrl((string)($event['downloadUrl'] ?? ''));

            $dataPayload = [
                'type' => 'admin_event',
                'eventTemplate' => $template,
            ];
            if ($downloadUrl !== null) {
                $dataPayload['downloadUrl'] = $downloadUrl;
            }

            $sent = 0;

            if ($canUseV1 && $firebaseV1 !== null) {
                $accessToken = $this->firebaseAccessToken($firebaseV1);
                if ($accessToken !== null) {
                    foreach ($tokenPayloadRows as $tokenRow) {
                        $token = (string)$tokenRow['token'];
                        $payload = [
                            'message' => [
                                'token' => $token,
                                'notification' => [
                                    'title' => $title,
                                    'body' => $body,
                                ],
                                'data' => $dataPayload,
                                'android' => [
                                    'priority' => 'high',
                                    'notification' => [
                                        'channel_id' => 'events',
                                        'icon' => 'ic_stat_vibe',
                                        'sound' => 'default',
                                    ],
                                ],
                                'apns' => [
                                    'headers' => [
                                        'apns-priority' => '10',
                                    ],
                                    'payload' => [
                                        'aps' => [
                                            'sound' => 'default',
                                            'content-available' => 1,
                                        ],
                                    ],
                                ],
                            ],
                        ];

                        $result = $this->sendFcmV1Payload($accessToken, $firebaseV1['projectId'], $payload);
                        if (!$result['ok'] && (int)($result['status'] ?? 0) === 401) {
                            $this->firebaseAccessTokenCache = null;
                            $refreshed = $this->firebaseAccessToken($firebaseV1);
                            if ($refreshed !== null) {
                                $result = $this->sendFcmV1Payload($refreshed, $firebaseV1['projectId'], $payload);
                            }
                        }

                        if (!empty($result['ok'])) {
                            $sent++;
                        }
                        $errorCode = strtoupper((string)($result['errorCode'] ?? ''));
                        if ($this->isInvalidPushTokenError($errorCode)) {
                            $this->deletePushTokenByValue($token);
                        }
                    }

                    return ['ok' => true, 'sent' => $sent];
                }
            }

            if (!$canUseLegacy) {
                return [
                    'ok' => false,
                    'sent' => 0,
                    'error' => 'Не удалось получить Firebase access token.',
                ];
            }

            foreach (array_chunk($tokenPayloadRows, 500) as $chunkRows) {
                $chunkTokens = array_values(array_map(
                    fn ($row) => (string)$row['token'],
                    $chunkRows
                ));
                if (!$chunkTokens) {
                    continue;
                }

                $payload = [
                    'registration_ids' => $chunkTokens,
                    'priority' => 'high',
                    'notification' => [
                        'title' => $title,
                        'body' => $body,
                        'icon' => 'ic_stat_vibe',
                        'sound' => 'default',
                        'android_channel_id' => 'events',
                    ],
                    'data' => $dataPayload,
                    'content_available' => true,
                    'mutable_content' => true,
                    'android_channel_id' => 'events',
                ];

                $legacyResult = $this->sendFcmPayload($serverKey, $payload);
                $sent += max(0, (int)($legacyResult['response']['success'] ?? 0));

                $results = $legacyResult['response']['results'] ?? [];
                if (!is_array($results)) {
                    $results = [];
                }
                foreach ($results as $index => $result) {
                    if (!is_array($result)) {
                        continue;
                    }
                    $errorCode = strtoupper((string)($result['error'] ?? ''));
                    if ($this->isInvalidPushTokenError($errorCode) && isset($chunkTokens[$index])) {
                        $this->deletePushTokenByValue($chunkTokens[$index]);
                    }
                }
            }

            return ['ok' => true, 'sent' => $sent];
        } catch (\Throwable) {
            return [
                'ok' => false,
                'sent' => 0,
                'error' => 'Не удалось отправить push-ивент.',
            ];
        }
    }

    private function sendFcmPayload(string $serverKey, array $payload): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return ['ok' => false, 'status' => 0, 'response' => [], 'errorCode' => 'JSON_ENCODE_FAILED'];
        }

        $ch = curl_init('https://fcm.googleapis.com/fcm/send');
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'response' => [], 'errorCode' => 'CURL_INIT_FAILED'];
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: key=' . $serverKey,
                'Content-Type: application/json',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_POSTFIELDS => $json,
        ]);
        $rawResponse = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($rawResponse === false) {
            return ['ok' => false, 'status' => $status, 'response' => [], 'errorCode' => 'CURL_EXEC_FAILED'];
        }

        $decoded = json_decode((string)$rawResponse, true);
        if (!is_array($decoded)) {
            $decoded = [];
        }

        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'response' => $decoded,
            'errorCode' => null,
        ];
    }

    private function firebaseV1Credentials(): ?array
    {
        $projectId = trim((string)Config::get('FCM_PROJECT_ID', ''));
        $clientEmail = trim((string)Config::get('FCM_CLIENT_EMAIL', ''));
        $privateKeyRaw = trim((string)Config::get('FCM_PRIVATE_KEY', ''));
        if ($projectId === '' || $clientEmail === '' || $privateKeyRaw === '') {
            return null;
        }

        $privateKey = str_replace(["\\r\\n", "\\n", "\\r"], "\n", $privateKeyRaw);
        if (!str_contains($privateKey, 'BEGIN PRIVATE KEY')) {
            return null;
        }

        return [
            'projectId' => $projectId,
            'clientEmail' => $clientEmail,
            'privateKey' => $privateKey,
        ];
    }

    private function firebaseAccessToken(array $credentials): ?string
    {
        $cache = $this->firebaseAccessTokenCache;
        if (
            is_array($cache)
            && !empty($cache['token'])
            && (int)($cache['expiresAt'] ?? 0) > (time() + 45)
        ) {
            return (string)$cache['token'];
        }

        $assertion = $this->buildGoogleServiceJwtAssertion($credentials);
        if ($assertion === null) {
            return null;
        }

        $ch = curl_init('https://oauth2.googleapis.com/token');
        if ($ch === false) {
            return null;
        }

        $postFields = http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $assertion,
        ]);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_POSTFIELDS => $postFields,
        ]);

        $rawResponse = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($rawResponse === false || $status < 200 || $status >= 300) {
            return null;
        }

        $decoded = json_decode((string)$rawResponse, true);
        if (!is_array($decoded)) {
            return null;
        }
        $token = trim((string)($decoded['access_token'] ?? ''));
        if ($token === '') {
            return null;
        }

        $expiresIn = max(60, (int)($decoded['expires_in'] ?? 3600));
        $this->firebaseAccessTokenCache = [
            'token' => $token,
            'expiresAt' => time() + $expiresIn,
        ];

        return $token;
    }

    private function buildGoogleServiceJwtAssertion(array $credentials): ?string
    {
        $issuedAt = time();
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        $claims = [
            'iss' => (string)$credentials['clientEmail'],
            'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $issuedAt,
            'exp' => $issuedAt + 3600,
        ];

        $encodedHeader = $this->base64UrlEncode((string)json_encode($header, JSON_UNESCAPED_SLASHES));
        $encodedClaims = $this->base64UrlEncode((string)json_encode($claims, JSON_UNESCAPED_SLASHES));
        $signingInput = $encodedHeader . '.' . $encodedClaims;

        $privateKey = openssl_pkey_get_private((string)$credentials['privateKey']);
        if ($privateKey === false) {
            return null;
        }

        $signature = '';
        $signed = openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        if (PHP_VERSION_ID < 80000) {
            openssl_free_key($privateKey);
        }
        if (!$signed) {
            return null;
        }

        return $signingInput . '.' . $this->base64UrlEncode($signature);
    }

    private function sendFcmV1Payload(string $accessToken, string $projectId, array $payload): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return ['ok' => false, 'status' => 0, 'response' => [], 'errorCode' => 'JSON_ENCODE_FAILED'];
        }

        $url = 'https://fcm.googleapis.com/v1/projects/' . rawurlencode($projectId) . '/messages:send';
        $ch = curl_init($url);
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'response' => [], 'errorCode' => 'CURL_INIT_FAILED'];
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $accessToken,
                'Content-Type: application/json; charset=UTF-8',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_POSTFIELDS => $json,
        ]);
        $rawResponse = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($rawResponse === false) {
            return ['ok' => false, 'status' => $status, 'response' => [], 'errorCode' => 'CURL_EXEC_FAILED'];
        }

        $decoded = json_decode((string)$rawResponse, true);
        if (!is_array($decoded)) {
            $decoded = [];
        }
        $errorCode = $this->extractFcmV1ErrorCode($decoded);

        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'response' => $decoded,
            'errorCode' => $errorCode,
        ];
    }

    private function extractFcmV1ErrorCode(array $response): ?string
    {
        $rootCode = strtoupper(trim((string)($response['error']['status'] ?? '')));
        if ($rootCode !== '') {
            return $rootCode;
        }

        $details = $response['error']['details'] ?? [];
        if (!is_array($details)) {
            return null;
        }

        foreach ($details as $detail) {
            if (!is_array($detail)) {
                continue;
            }
            $code = strtoupper(trim((string)($detail['errorCode'] ?? $detail['reason'] ?? '')));
            if ($code !== '') {
                return $code;
            }
        }

        return null;
    }

    private function isInvalidPushTokenError(string $errorCode): bool
    {
        if ($errorCode === '') {
            return false;
        }
        $normalized = strtoupper(trim($errorCode));
        return in_array($normalized, [
            'UNREGISTERED',
            'INVALID_ARGUMENT',
            'NOTREGISTERED',
            'INVALIDREGISTRATION',
            'MISMATCHSENDERID',
        ], true);
    }

    private function deletePushTokenByValue(string $token): void
    {
        $normalized = trim($token);
        if ($normalized === '') {
            return;
        }

        try {
            $stmt = $this->db()->prepare('DELETE FROM push_tokens WHERE token = ?');
            $stmt->execute([$normalized]);
        } catch (\Throwable) {
            // ignore cleanup errors
        }
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function ensurePushTokensTable(): bool
    {
        if ($this->pushTokensTableReady !== null) {
            return $this->pushTokensTableReady;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS push_tokens (
                    id CHAR(36) PRIMARY KEY,
                    user_id CHAR(36) NOT NULL,
                    token VARCHAR(512) NOT NULL,
                    platform VARCHAR(32) NOT NULL DEFAULT "unknown",
                    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_push_token (token),
                    KEY idx_push_user (user_id),
                    CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
            $this->pushTokensTableReady = true;
        } catch (\Throwable) {
            $this->pushTokensTableReady = false;
        }

        return $this->pushTokensTableReady;
    }

    private function ensureStoryTables(): bool
    {
        if ($this->storyTablesReady !== null) {
            return $this->storyTablesReady;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS stories (
                    id CHAR(36) PRIMARY KEY,
                    user_id CHAR(36) NOT NULL,
                    text TEXT NULL,
                    media_url VARCHAR(2048) NULL,
                    media_urls LONGTEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_stories_user_created (user_id, created_at),
                    KEY idx_stories_expires (expires_at),
                    CONSTRAINT fk_story_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );

            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS story_views (
                    story_id CHAR(36) NOT NULL,
                    user_id CHAR(36) NOT NULL,
                    viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (story_id, user_id),
                    KEY idx_story_views_user (user_id),
                    CONSTRAINT fk_story_view_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
                    CONSTRAINT fk_story_view_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );

            try {
                $columns = [];
                $stmt = $this->db()->query('SHOW COLUMNS FROM stories');
                foreach (($stmt ? $stmt->fetchAll() : []) as $row) {
                    $name = strtolower((string)($row['Field'] ?? ''));
                    if ($name !== '') {
                        $columns[$name] = true;
                    }
                }
                if (!isset($columns['media_urls'])) {
                    $this->db()->exec('ALTER TABLE stories ADD COLUMN media_urls LONGTEXT NULL');
                }
            } catch (\Throwable) {
                // keep working even when SHOW/ALTER is restricted
            }

            $this->storyTablesReady = true;
        } catch (\Throwable) {
            $this->storyTablesReady = false;
        }

        return $this->storyTablesReady;
    }

    private function ensureStoryMediaTable(): bool
    {
        if ($this->storyMediaTableReady !== null) {
            return $this->storyMediaTableReady;
        }

        if (!$this->ensureStoryTables()) {
            $this->storyMediaTableReady = false;
            return false;
        }

        try {
            $this->db()->exec(
                'CREATE TABLE IF NOT EXISTS story_media (
                    id CHAR(36) PRIMARY KEY,
                    story_id CHAR(36) NOT NULL,
                    media_url VARCHAR(2048) NOT NULL,
                    position INT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_story_media_story_pos (story_id, position, created_at),
                    CONSTRAINT fk_story_media_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
            $this->storyMediaTableReady = true;
        } catch (\Throwable) {
            try {
                $this->db()->exec(
                    'CREATE TABLE IF NOT EXISTS story_media (
                        id CHAR(36) PRIMARY KEY,
                        story_id CHAR(36) NOT NULL,
                        media_url VARCHAR(2048) NOT NULL,
                        position INT NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        KEY idx_story_media_story_pos (story_id, position, created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
                );
                $this->storyMediaTableReady = true;
            } catch (\Throwable) {
                $this->storyMediaTableReady = false;
            }
        }

        return $this->storyMediaTableReady;
    }

    private function uploadFiles(): void
    {
        $this->authUserId();

        if (!isset($_FILES['files']) || !is_array($_FILES['files'])) {
            $this->json(['error' => 'Files are required'], 400);
        }

        $files = $this->normalizeUploadedFiles($_FILES['files']);
        if (!$files) {
            $this->json(['error' => 'Files are required'], 400);
        }

        $uploadDir = dirname(__DIR__) . '/public/uploads/messages';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
            $this->json(['error' => 'Cannot create upload directory'], 500);
        }

        $maxSize = 64 * 1024 * 1024;
        $mimeToExt = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/heic' => 'heic',
            'image/heif' => 'heif',
            'video/mp4' => 'mp4',
            'video/quicktime' => 'mov',
            'video/webm' => 'webm',
            'video/x-msvideo' => 'avi',
            'video/x-matroska' => 'mkv',
            'video/x-m4v' => 'm4v',
            'video/3gpp' => '3gp',
            'video/3gpp2' => '3g2',
            'audio/mpeg' => 'mp3',
            'audio/mp4' => 'm4a',
            'audio/aac' => 'aac',
            'audio/ogg' => 'ogg',
            'application/pdf' => 'pdf',
            'text/plain' => 'txt',
            'application/zip' => 'zip',
            'application/x-zip-compressed' => 'zip',
        ];

        $result = [];
        foreach ($files as $file) {
            if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                continue;
            }

            $tmp = (string)($file['tmp_name'] ?? '');
            if ($tmp === '' || !is_uploaded_file($tmp)) {
                continue;
            }

            $size = (int)($file['size'] ?? 0);
            if ($size <= 0 || $size > $maxSize) {
                continue;
            }

            $mime = (string)(mime_content_type($tmp) ?: '');
            $ext = $mimeToExt[$mime] ?? '';
            if ($ext === '') {
                $originalExt = strtolower((string)pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
                if (preg_match('/^[a-z0-9]{1,8}$/', $originalExt)) {
                    $ext = $originalExt;
                }
            }
            if ($ext === '') {
                continue;
            }

            $id = $this->uuid();
            $fileName = $id . '.' . $ext;
            $dest = $uploadDir . '/' . $fileName;
            if (!move_uploaded_file($tmp, $dest)) {
                continue;
            }

            $relative = '/uploads/messages/' . $fileName;
            $result[] = [
                'id' => $id,
                'name' => (string)($file['name'] ?? $fileName),
                'url' => $this->buildPublicUrl($relative),
                'type' => $this->attachmentTypeFromMime($mime, $ext),
                'size' => $size,
            ];
        }

        if (!$result) {
            $this->json(['error' => 'No valid files uploaded'], 400);
        }

        $this->json(['files' => $result], 201);
    }

    private function uploadStoryFiles(): void
    {
        $this->authUserId();

        if (!isset($_FILES['files']) || !is_array($_FILES['files'])) {
            $this->json(['error' => 'Files are required'], 400);
        }

        $files = $this->normalizeUploadedFiles($_FILES['files']);
        if (!$files) {
            $this->json(['error' => 'Files are required'], 400);
        }
        if (count($files) > self::STORY_MAX_MEDIA_ITEMS) {
            $this->json(['error' => 'Maximum 10 photos per status'], 400);
        }

        $uploadDir = dirname(__DIR__) . '/public/uploads/stories';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
            $this->json(['error' => 'Cannot create upload directory'], 500);
        }

        $maxSize = 25 * 1024 * 1024;
        $mimeToExt = [
            'image/jpeg' => 'jpg',
            'image/jpg' => 'jpg',
            'image/pjpeg' => 'jpg',
            'image/png' => 'png',
            'image/x-png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/heic' => 'heic',
            'image/heif' => 'heif',
            'image/avif' => 'avif',
        ];
        $extFallback = [
            'jpeg' => 'jpg',
            'jpg' => 'jpg',
            'png' => 'png',
            'webp' => 'webp',
            'gif' => 'gif',
            'heic' => 'heic',
            'heif' => 'heif',
            'bmp' => 'bmp',
            'avif' => 'avif',
        ];

        $result = [];
        $failed = 0;
        $expectedCount = count($files);
        foreach ($files as $file) {
            if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                $failed++;
                continue;
            }

            $tmp = (string)($file['tmp_name'] ?? '');
            if ($tmp === '' || !is_uploaded_file($tmp)) {
                $failed++;
                continue;
            }

            $size = (int)($file['size'] ?? 0);
            if ($size <= 0 || $size > $maxSize) {
                $failed++;
                continue;
            }

            $mime = strtolower(trim((string)(mime_content_type($tmp) ?: '')));
            $ext = $mimeToExt[$mime] ?? '';
            if ($ext === '') {
                $nameExt = strtolower(trim((string)pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION)));
                $ext = $extFallback[$nameExt] ?? '';
            }
            if ($ext === '') {
                $failed++;
                continue;
            }

            $id = $this->uuid();
            $fileName = $id . '.' . $ext;
            $dest = $uploadDir . '/' . $fileName;
            if (!move_uploaded_file($tmp, $dest)) {
                $failed++;
                continue;
            }

            $relative = '/uploads/stories/' . $fileName;
            $result[] = [
                'id' => $id,
                'name' => (string)($file['name'] ?? $fileName),
                'url' => $this->buildPublicUrl($relative),
                'type' => 'image',
                'size' => $size,
            ];
        }

        if (!$result) {
            $this->json(['error' => 'No valid image files uploaded'], 400);
        }
        if ($failed > 0 || count($result) !== $expectedCount) {
            foreach ($result as $item) {
                $url = trim((string)($item['url'] ?? ''));
                if ($url === '') {
                    continue;
                }
                $this->deleteUploadedFileByUrl($url, ['/uploads/stories/']);
            }
            $this->json(['error' => 'Some files failed to upload. Check image format and size (max 25 MB).'], 400);
        }

        $this->json(['files' => $result], 201);
    }

    private function normalizeUploadedFiles(array $raw): array
    {
        $names = $raw['name'] ?? null;
        if (!is_array($names)) {
            return [$raw];
        }

        $files = [];
        $count = count($names);
        for ($i = 0; $i < $count; $i++) {
            $files[] = [
                'name' => $raw['name'][$i] ?? '',
                'type' => $raw['type'][$i] ?? '',
                'tmp_name' => $raw['tmp_name'][$i] ?? '',
                'error' => $raw['error'][$i] ?? UPLOAD_ERR_NO_FILE,
                'size' => $raw['size'][$i] ?? 0,
            ];
        }

        return $files;
    }

    private function attachmentTypeFromMime(string $mime, string $ext): string
    {
        $normalizedMime = strtolower(trim($mime));
        if ($this->startsWith($normalizedMime, 'image/')) return 'image';
        if ($this->startsWith($normalizedMime, 'video/')) return 'video';
        if ($this->startsWith($normalizedMime, 'audio/')) return 'audio';

        $normalizedExt = strtolower(trim($ext));
        if (in_array($normalizedExt, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'avif'], true)) return 'image';
        if (in_array($normalizedExt, ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'avi'], true)) return 'video';
        if (in_array($normalizedExt, ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'], true)) return 'audio';
        return 'file';
    }

    private function uploadAvatar(): void
    {
        $userId = $this->authUserId();

        $previousAvatar = '';
        try {
            $stmt = $this->db()->prepare('SELECT avatar FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $previousAvatar = trim((string)($stmt->fetchColumn() ?: ''));
        } catch (\Throwable) {
            $previousAvatar = '';
        }

        if (!isset($_FILES['avatar']) || !is_array($_FILES['avatar'])) {
            $this->json(['error' => 'Avatar file is required'], 400);
        }

        $file = $_FILES['avatar'];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $this->json(['error' => 'Upload failed'], 400);
        }

        $tmp = (string)($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            $this->json(['error' => 'Invalid upload'], 400);
        }

        $maxSize = 5 * 1024 * 1024;
        if (($file['size'] ?? 0) > $maxSize) {
            $this->json(['error' => 'File too large'], 400);
        }

        $mime = mime_content_type($tmp) ?: '';
        $allowed = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        ];

        if (!isset($allowed[$mime])) {
            $this->json(['error' => 'Unsupported image format'], 400);
        }

        $ext = $allowed[$mime];
        $fileName = $this->uuid() . '.' . $ext;
        $uploadDir = dirname(__DIR__) . '/public/uploads/avatars';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
            $this->json(['error' => 'Cannot create upload directory'], 500);
        }

        $dest = $uploadDir . '/' . $fileName;
        if (!move_uploaded_file($tmp, $dest)) {
            $this->json(['error' => 'Cannot save file'], 500);
        }

        $relative = '/uploads/avatars/' . $fileName;
        $url = $this->buildPublicUrl($relative);

        try {
            $update = $this->db()->prepare('UPDATE users SET avatar = ? WHERE id = ?');
            $update->execute([$url, $userId]);
        } catch (\Throwable) {
            if (is_file($dest)) {
                @unlink($dest);
            }
            $this->json(['error' => 'Cannot update user avatar'], 500);
        }

        if ($previousAvatar !== '' && strcasecmp($previousAvatar, $url) !== 0) {
            $this->deleteUploadedFileByUrl($previousAvatar, ['/uploads/avatars/']);
        }

        $this->json(['url' => $url], 201);
    }

    private function uploadGroupAvatar(): void
    {
        $this->authUserId();

        if (!isset($_FILES['avatar']) || !is_array($_FILES['avatar'])) {
            $this->json(['error' => 'Avatar file is required'], 400);
        }

        $file = $_FILES['avatar'];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $this->json(['error' => 'Upload failed'], 400);
        }

        $tmp = (string)($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            $this->json(['error' => 'Invalid upload'], 400);
        }

        $maxSize = 5 * 1024 * 1024;
        if (($file['size'] ?? 0) > $maxSize) {
            $this->json(['error' => 'File too large'], 400);
        }

        $mime = mime_content_type($tmp) ?: '';
        $allowed = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        ];

        if (!isset($allowed[$mime])) {
            $this->json(['error' => 'Unsupported image format'], 400);
        }

        $ext = $allowed[$mime];
        $fileName = $this->uuid() . '.' . $ext;
        $uploadDir = dirname(__DIR__) . '/public/uploads/group-avatars';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
            $this->json(['error' => 'Cannot create upload directory'], 500);
        }

        $dest = $uploadDir . '/' . $fileName;
        if (!move_uploaded_file($tmp, $dest)) {
            $this->json(['error' => 'Cannot save file'], 500);
        }

        $relative = '/uploads/group-avatars/' . $fileName;
        $url = $this->buildPublicUrl($relative);

        $this->json(['url' => $url], 201);
    }

    private function uploadStorageStats(): void
    {
        $this->authUserId();

        $publicDir = dirname(__DIR__) . '/public';
        $uploadsDir = $publicDir . '/uploads';
        $photosBytes = 0;
        $videosBytes = 0;
        $audioBytes = 0;
        $filesBytes = 0;
        $cacheBytes = 0;

        $photoExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif'];
        $videoExt = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'];
        $audioExt = ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'];

        foreach ($this->listFilesRecursively($uploadsDir) as $filePath) {
            $size = filesize($filePath);
            if (!is_int($size) || $size <= 0) {
                continue;
            }

            $normalizedPath = strtolower(str_replace('\\', '/', $filePath));
            if (
                strpos($normalizedPath, '/uploads/cache/') !== false ||
                strpos($normalizedPath, '/uploads/tmp/') !== false
            ) {
                $cacheBytes += $size;
                continue;
            }

            $ext = strtolower((string)pathinfo($filePath, PATHINFO_EXTENSION));
            if (in_array($ext, $photoExt, true)) {
                $photosBytes += $size;
                continue;
            }
            if (in_array($ext, $videoExt, true)) {
                $videosBytes += $size;
                continue;
            }
            if (in_array($ext, $audioExt, true)) {
                $audioBytes += $size;
                continue;
            }

            $filesBytes += $size;
        }

        $cacheBytes += $this->directorySize($publicDir . '/cache');
        $totalBytes = $photosBytes + $videosBytes + $audioBytes + $filesBytes + $cacheBytes;

        $this->json([
            'photosBytes' => $photosBytes,
            'videosBytes' => $videosBytes,
            'audioBytes' => $audioBytes,
            'filesBytes' => $filesBytes,
            'cacheBytes' => $cacheBytes,
            'totalBytes' => $totalBytes,
        ]);
    }

    private function clearUploadCache(): void
    {
        $this->authUserId();

        $publicDir = dirname(__DIR__) . '/public';
        $cacheDirs = [
            $publicDir . '/cache',
            $publicDir . '/uploads/cache',
            $publicDir . '/uploads/tmp',
        ];

        $clearedBytes = 0;
        foreach ($cacheDirs as $dir) {
            $clearedBytes += $this->clearDirectoryContents($dir);
        }

        $this->json([
            'ok' => true,
            'clearedBytes' => $clearedBytes,
        ]);
    }

    private function listFilesRecursively(string $dir): array
    {
        if (!is_dir($dir)) {
            return [];
        }

        $result = [];
        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)
            );
            foreach ($iterator as $item) {
                if ($item->isFile()) {
                    $result[] = $item->getPathname();
                }
            }
        } catch (\Throwable) {
            return [];
        }

        return $result;
    }

    private function directorySize(string $dir): int
    {
        $total = 0;
        foreach ($this->listFilesRecursively($dir) as $filePath) {
            $size = filesize($filePath);
            if (is_int($size) && $size > 0) {
                $total += $size;
            }
        }

        return $total;
    }

    private function clearDirectoryContents(string $dir): int
    {
        if (!is_dir($dir)) {
            return 0;
        }

        $cleared = 0;
        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::CHILD_FIRST
            );

            foreach ($iterator as $item) {
                $path = $item->getPathname();
                if ($item->isFile()) {
                    $size = filesize($path);
                    if (is_int($size) && $size > 0) {
                        $cleared += $size;
                    }
                    @unlink($path);
                    continue;
                }

                if ($item->isDir()) {
                    @rmdir($path);
                }
            }
        } catch (\Throwable) {
            // keep best-effort cleanups on restricted hosting
        }

        return $cleared;
    }

    private function deleteAllAttachmentFiles(): int
    {
        if (!$this->ensureAttachmentsTable()) {
            return 0;
        }

        try {
            $stmt = $this->db()->query('SELECT url FROM attachments');
            $rows = $stmt->fetchAll() ?: [];
        } catch (\Throwable) {
            return 0;
        }

        $deleted = 0;
        foreach ($rows as $row) {
            $url = trim((string)($row['url'] ?? ''));
            if ($url === '') continue;
            $this->deleteUploadedFileByUrl($url, ['/uploads/messages/']);
            $deleted++;
        }

        return $deleted;
    }

    private function deleteAttachmentFilesByMessageIds(array $messageIds): int
    {
        $ids = array_values(array_filter(array_map('strval', $messageIds), fn ($id) => $id !== ''));
        if (!$ids || !$this->ensureAttachmentsTable()) {
            return 0;
        }

        try {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $this->db()->prepare("SELECT url FROM attachments WHERE message_id IN ({$placeholders})");
            $stmt->execute($ids);
            $rows = $stmt->fetchAll() ?: [];
        } catch (\Throwable) {
            return 0;
        }

        $deleted = 0;
        foreach ($rows as $row) {
            $url = trim((string)($row['url'] ?? ''));
            if ($url === '') continue;
            $this->deleteUploadedFileByUrl($url, ['/uploads/messages/']);
            $deleted++;
        }

        return $deleted;
    }

    private function deleteChatAvatarById(string $chatId): void
    {
        $id = trim($chatId);
        if ($id === '') {
            return;
        }

        try {
            $stmt = $this->db()->prepare('SELECT avatar FROM chats WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $avatar = trim((string)$stmt->fetchColumn());
            if ($avatar === '') {
                return;
            }

            $this->deleteUploadedFileByUrl($avatar, ['/uploads/group-avatars/']);
        } catch (\Throwable) {
            // ignore chat avatar cleanup failures
        }
    }

    private function extractUploadsRelativePath(string $url): ?string
    {
        $path = parse_url($url, PHP_URL_PATH);
        if (!is_string($path) || trim($path) === '') {
            return null;
        }

        $normalized = '/' . ltrim(str_replace('\\', '/', $path), '/');
        $position = strpos($normalized, '/uploads/');
        if ($position === false) {
            return null;
        }

        $relative = substr($normalized, $position);
        if (!is_string($relative) || $relative === '' || strpos($relative, '..') !== false) {
            return null;
        }

        return $relative;
    }

    private function deleteUploadedFileByUrl(string $url, array $allowedPrefixes = []): void
    {
        $relative = $this->extractUploadsRelativePath($url);
        if ($relative === null) {
            return;
        }

        if ($allowedPrefixes) {
            $allowed = false;
            foreach ($allowedPrefixes as $prefix) {
                if ($this->startsWith($relative, $prefix)) {
                    $allowed = true;
                    break;
                }
            }
            if (!$allowed) {
                return;
            }
        }

        $fullPath = dirname(__DIR__) . '/public' . $relative;
        if (is_file($fullPath)) {
            @unlink($fullPath);
        }
    }

    private function attachmentTypeFromPath(string $path): string
    {
        $ext = strtolower((string)pathinfo($path, PATHINFO_EXTENSION));
        return $this->attachmentTypeFromMime('', $ext);
    }

    private function creatorUserId(): string
    {
        $configuredRaw = trim((string)Config::get('CREATOR_USER_ID', ''));
        $configured = $configuredRaw;
        if ($configuredRaw !== '' && preg_match('/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i', $configuredRaw, $m)) {
            $configured = (string)$m[1];
        }

        if ($configured !== '') {
            try {
                $stmt = $this->db()->prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?) LIMIT 1');
                $stmt->execute([$configured]);
                $found = $stmt->fetchColumn();
                if ($found) {
                    return (string)$found;
                }
            } catch (\Throwable) {
                return $configured;
            }
        }

        try {
            $stmt = $this->db()->query('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1');
            $first = $stmt->fetchColumn();
            if ($first) {
                return (string)$first;
            }
        } catch (\Throwable) {
            // fallback below
        }

        try {
            $stmt = $this->db()->query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
            $first = $stmt->fetchColumn();
            if ($first) {
                return (string)$first;
            }
        } catch (\Throwable) {
            // fallback below
        }

        try {
            $stmt = $this->db()->query('SELECT id FROM users LIMIT 1');
            $first = $stmt->fetchColumn();
            return $first ? (string)$first : '';
        } catch (\Throwable) {
            return '';
        }
    }

    private function isCreatorMatch(string $userId): bool
    {
        $creatorId = trim($this->creatorUserId());
        $candidate = trim($userId);
        if ($creatorId === '' || $candidate === '') {
            return false;
        }

        return strtolower($creatorId) === strtolower($candidate);
    }

    private function assertCreator(string $userId): void
    {
        if (!$this->isCreatorMatch($userId)) {
            $this->json(['error' => 'Forbidden'], 403);
        }
    }

    private function authUserId(): string
    {
        $auth = $this->getAuthorizationHeader();
        if ($auth === '' || stripos($auth, 'Bearer ') !== 0) {
            $this->json(['error' => 'Unauthorized'], 401);
        }

        $payload = Jwt::verify(trim(substr($auth, 7)));
        if (!$payload || empty($payload['userId'])) $this->json(['error' => 'Unauthorized'], 401);

        $userId = (string)$payload['userId'];
        try {
            if ($this->hasUserColumn('is_banned')) {
                $select = 'SELECT is_banned';
                if ($this->hasUserColumn('ban_reason')) {
                    $select .= ', ban_reason';
                }
                $select .= ' FROM users WHERE id = ? LIMIT 1';
                $stmt = $this->db()->prepare($select);
                $stmt->execute([$userId]);
                $row = $stmt->fetch();
                if (!$row) {
                    $this->json(['error' => 'Unauthorized'], 401);
                }
                if (!empty($row['is_banned'])) {
                    $this->json([
                        'error' => 'banned',
                        'reason' => $this->hasUserColumn('ban_reason') ? (string)($row['ban_reason'] ?? '') : '',
                        'message' => 'Данный пользователь заблокирован',
                    ], 403);
                }
            } else {
                $stmt = $this->db()->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
                $stmt->execute([$userId]);
                if (!$stmt->fetchColumn()) {
                    $this->json(['error' => 'Unauthorized'], 401);
                }
            }
        } catch (\Throwable) {
            $this->json(['error' => 'Unauthorized'], 401);
        }
        $this->touchUserPresence($userId);

        return $userId;
    }

    private function getAuthorizationHeader(): string
    {
        $candidates = [
            $_SERVER['HTTP_AUTHORIZATION'] ?? null,
            $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
            $_SERVER['Authorization'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            if (is_array($headers)) {
                foreach ($headers as $key => $value) {
                    if (strcasecmp((string)$key, 'Authorization') === 0 && is_string($value) && trim($value) !== '') {
                        return trim($value);
                    }
                }
            }
        }

        return '';
    }



    private function normalizePresence(string $status, $lastSeen): array
    {
        $normalizedStatus = $status !== '' ? $status : 'offline';
        $lastSeenIso = null;

        if ($lastSeen) {
            $lastSeenTs = strtotime((string)$lastSeen);
            if ($lastSeenTs !== false) {
                $lastSeenIso = date('c', $lastSeenTs);
                if ($normalizedStatus === 'online' && $lastSeenTs < (time() - 300)) {
                    $normalizedStatus = 'offline';
                }
            }
        }

        return [
            'status' => $normalizedStatus,
            'lastSeen' => $lastSeenIso,
        ];
    }

    private function touchUserPresence(string $userId): void
    {
        try {
            $stmt = $this->db()->prepare('UPDATE users SET status = "online", last_seen = CURRENT_TIMESTAMP WHERE id = ?');
            $stmt->execute([$userId]);
        } catch (\Throwable) {
            // ignore presence update failures
        }
    }

    private function chatParticipantMetaSelectSql(): string
    {
        $parts = [];
        $parts[] = $this->hasChatParticipantColumn('archived') ? 'cp.archived AS archived' : '0 AS archived';
        $parts[] = $this->hasChatParticipantColumn('pinned') ? 'cp.pinned AS pinned' : '0 AS pinned';
        $parts[] = $this->hasChatParticipantColumn('muted') ? 'cp.muted AS muted' : '0 AS muted';
        $parts[] = $this->hasChatParticipantColumn('blocked') ? 'cp.blocked AS blocked' : '0 AS blocked';
        $parts[] = $this->hasChatParticipantColumn('is_admin') ? 'cp.is_admin AS is_admin' : '0 AS is_admin';
        $parts[] = $this->hasChatParticipantColumn('unread_count') ? 'cp.unread_count AS unread_count' : '0 AS unread_count';

        return implode(', ', $parts);
    }

    private function chatParticipantOrderBySql(): string
    {
        return $this->hasChatParticipantColumn('pinned')
            ? 'cp.pinned DESC, c.updated_at DESC'
            : 'c.updated_at DESC';
    }

    private function hasChatParticipantColumn(string $column): bool
    {
        $columns = $this->chatParticipantColumns();
        return isset($columns[strtolower($column)]);
    }

    private function hasChatColumn(string $column): bool
    {
        $columns = $this->chatColumns();
        return isset($columns[strtolower($column)]);
    }

    private function hasUserColumn(string $column): bool
    {
        $columns = $this->userColumns();
        return isset($columns[strtolower($column)]);
    }

    private function hasNotificationColumn(string $column): bool
    {
        $columns = $this->notificationColumns();
        return isset($columns[strtolower($column)]);
    }

    private function ensureUserProfileColumns(): void
    {
        if ($this->hasUserColumn('birth_date')) {
            return;
        }

        try {
            $this->db()->exec('ALTER TABLE users ADD COLUMN birth_date DATE NULL');
            $this->userColumns = null;
        } catch (\Throwable) {
            // ignore profile schema migration errors on restricted hosting
        }
    }

    private function normalizeBirthDateValue(string $raw): ?string
    {
        $value = trim($raw);
        if ($value === '') {
            return null;
        }

        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
            $year = (int)$m[1];
            $month = (int)$m[2];
            $day = (int)$m[3];
        } else {
            $digits = preg_replace('/\D+/', '', $value) ?? '';
            if (strlen($digits) !== 8) {
                return null;
            }
            $day = (int)substr($digits, 0, 2);
            $month = (int)substr($digits, 2, 2);
            $year = (int)substr($digits, 4, 4);
        }

        $currentYear = (int)date('Y');
        if ($year < 1900 || $year > $currentYear || !checkdate($month, $day, $year)) {
            return null;
        }

        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    private function ensureUserBanColumns(): bool
    {
        $hasBanned = $this->hasUserColumn('is_banned');
        $hasReason = $this->hasUserColumn('ban_reason');
        if ($hasBanned && $hasReason) {
            return true;
        }

        try {
            if (!$hasBanned) {
                $this->db()->exec('ALTER TABLE users ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0');
            }
            if (!$hasReason) {
                $this->db()->exec('ALTER TABLE users ADD COLUMN ban_reason VARCHAR(1024) NULL');
            }
            $this->userColumns = null;
        } catch (\Throwable) {
            return false;
        }

        return $this->hasUserColumn('is_banned') && $this->hasUserColumn('ban_reason');
    }

    private function ensureUserNotificationColumns(): bool
    {
        $hasPrivate = $this->hasUserColumn('notify_private_chats');
        $hasGroup = $this->hasUserColumn('notify_group_chats');
        if ($hasPrivate && $hasGroup) {
            return true;
        }

        try {
            if (!$hasPrivate) {
                $this->db()->exec('ALTER TABLE users ADD COLUMN notify_private_chats TINYINT(1) NOT NULL DEFAULT 1');
            }
            if (!$hasGroup) {
                $this->db()->exec('ALTER TABLE users ADD COLUMN notify_group_chats TINYINT(1) NOT NULL DEFAULT 1');
            }
            $this->userColumns = null;
        } catch (\Throwable) {
            return $this->hasUserColumn('notify_private_chats') && $this->hasUserColumn('notify_group_chats');
        }

        return $this->hasUserColumn('notify_private_chats') && $this->hasUserColumn('notify_group_chats');
    }

    private function chatColumns(): array
    {
        if ($this->chatColumns !== null) {
            return $this->chatColumns;
        }

        $columns = [];
        try {
            $stmt = $this->db()->query('SHOW COLUMNS FROM chats');
            foreach ($stmt->fetchAll() as $row) {
                $name = strtolower((string)($row['Field'] ?? ''));
                if ($name !== '') {
                    $columns[$name] = true;
                }
            }

            $optional = [
                'owner_id' => 'CHAR(36) NULL',
            ];
            foreach ($optional as $name => $definition) {
                if (isset($columns[$name])) {
                    continue;
                }
                try {
                    $this->db()->exec("ALTER TABLE chats ADD COLUMN {$name} {$definition}");
                    $columns[$name] = true;
                } catch (\Throwable) {
                    // keep graceful fallback for shared hosting with no ALTER privileges
                }
            }
        } catch (\Throwable) {
            $columns = [
                'id' => true,
                'name' => true,
                'type' => true,
            ];
        }

        $this->chatColumns = $columns;
        return $columns;
    }

    private function chatParticipantColumns(): array
    {
        if ($this->chatParticipantColumns !== null) {
            return $this->chatParticipantColumns;
        }

        $columns = [];
        try {
            $stmt = $this->db()->query('SHOW COLUMNS FROM chat_participants');
            foreach ($stmt->fetchAll() as $row) {
                $name = strtolower((string)($row['Field'] ?? ''));
                if ($name !== '') {
                    $columns[$name] = true;
                }
            }

            $optional = [
                'archived' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'pinned' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'muted' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'blocked' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'is_admin' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'unread_count' => 'INT NOT NULL DEFAULT 0',
            ];
            foreach ($optional as $name => $definition) {
                if (isset($columns[$name])) {
                    continue;
                }
                try {
                    $this->db()->exec("ALTER TABLE chat_participants ADD COLUMN {$name} {$definition}");
                    $columns[$name] = true;
                } catch (\Throwable) {
                    // keep graceful fallback for shared hosting with no ALTER privileges
                }
            }
        } catch (\Throwable) {
            // If SHOW COLUMNS is restricted, keep only guaranteed core fields.
            $columns = [
                'chat_id' => true,
                'user_id' => true,
            ];
        }

        $this->chatParticipantColumns = $columns;
        return $columns;
    }

    private function userColumns(): array
    {
        if ($this->userColumns !== null) {
            return $this->userColumns;
        }

        $columns = [];
        try {
            $stmt = $this->db()->query('SHOW COLUMNS FROM users');
            foreach ($stmt->fetchAll() as $row) {
                $name = strtolower((string)($row['Field'] ?? ''));
                if ($name !== '') {
                    $columns[$name] = true;
                }
            }
        } catch (\Throwable) {
            $columns = ['id' => true];
        }

        $this->userColumns = $columns;
        return $columns;
    }

    private function notificationColumns(): array
    {
        if ($this->notificationColumns !== null) {
            return $this->notificationColumns;
        }

        $columns = [];
        try {
            $stmt = $this->db()->query('SHOW COLUMNS FROM notifications');
            foreach ($stmt->fetchAll() as $row) {
                $name = strtolower((string)($row['Field'] ?? ''));
                if ($name !== '') {
                    $columns[$name] = true;
                }
            }
        } catch (\Throwable) {
            $columns = ['id' => true];
        }

        $this->notificationColumns = $columns;
        return $columns;
    }

    private function db(): PDO
    {
        if ($this->db === null) {
            $this->db = Database::connection();
        }
        return $this->db;
    }

    private function normalizePath(string $rawPath): string
    {
        if (strpos($rawPath, '/index.php/') !== false) {
            $parts = explode('/index.php/', $rawPath, 2);
            return '/' . ltrim($parts[1], '/');
        }

        if (substr($rawPath, -10) === '/index.php') {
            return '/';
        }

        return $rawPath;
    }

    private function startsWith(string $haystack, string $needle): bool
    {
        return substr($haystack, 0, strlen($needle)) === $needle;
    }

    private function buildPublicUrl(string $relativePath): string
    {
        $relative = '/' . ltrim($relativePath, '/');
        $base = rtrim((string)Config::get('APP_URL', ''), '/');

        $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
        $scriptDir = str_replace('\\', '/', dirname($scriptName));
        if ($scriptDir === '.' || $scriptDir === '/' || $scriptDir === '\\') {
            $scriptDir = '';
        }

        if ($base !== '') {
            $needsScriptDir = $scriptDir !== '' && !preg_match('#' . preg_quote($scriptDir, '#') . '/?$#i', $base);
            return $base . ($needsScriptDir ? $scriptDir : '') . $relative;
        }

        return ($scriptDir !== '' ? $scriptDir : '') . $relative;
    }

    private function cors(): void
    {
        $originConfig = (string)Config::get('CORS_ORIGIN', '*');
        $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($originConfig === '*') {
            header('Access-Control-Allow-Origin: *');
        } else {
            $allowed = array_map('trim', explode(',', $originConfig));
            if ($requestOrigin !== '' && in_array($requestOrigin, $allowed, true)) {
                header('Access-Control-Allow-Origin: ' . $requestOrigin);
            } else {
                header('Access-Control-Allow-Origin: ' . $allowed[0]);
            }
            header('Vary: Origin');
        }

        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Content-Type: application/json');
    }

    private function json(array $payload, int $status = 200): void
    {
        http_response_code($status);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}


