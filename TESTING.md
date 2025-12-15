# Testing & Manual Verification

This file lists test templates and manual steps to verify Trash (soft-delete / restore / permanent delete) functionality.

## Run automated tests (templates)

### Backend (pytest)
- Location: `backend/tests/test_trash.py`
- Run with:
```bash
cd backend
pytest -q
```

The tests use a temporary directory and patch `HEXO_BASE_PATH` / `POSTS_PATH` so they don't touch your real blog files.

### Frontend (Jest + React Testing Library)
- Location: `components/__tests__/TrashView.test.tsx`
- Run with your project's test runner (may require `jest` or `vitest` configured). These tests mock `realFileService` and exercise the UI, including the progress callbacks for batch operations.

## Manual verification steps
1. Start the backend and frontend (ensure `backend/main.py` `HEXO_BASE_PATH` is configured to a test directory or your Hexo folder).
2. Create some sample posts under `source/_posts/` (e.g., `2025-12-01-sample.md`, `category/2025-12-02-sample.md`).
3. In the UI open Trash and use the file browser to delete the sample posts. They should show up in the Trash modal.

**Workspace & Posts Folder:** If you point the app to a folder that does not contain `source/_posts`, the app will accept that folder as a workspace. You can either use it directly (the app will show `.md`/`.txt` files under that root), or click **Create posts folder** in the setup screen to create `source/_posts` automatically.4. Test single restore: Restore one item and assert that it reappears in the file tree and is removed from Trash.
5. Test restore conflict: Create a file at the target location with the same name and try restore — the operation should fail with a 409 Conflict.
6. Test batch restore: Select multiple items across folders, click `Restore Selected`. The UI should show a progress bar, per-item statuses, and refresh on success.
7. Test partial failure & retry: Simulate one item failing to restore (conflict) and verify the failed item's status is shown as Failed; then retry the restore and verify it succeeds.
8. Test batch permanent delete: Select multiple items, click `Delete Selected`, type `DELETE` to confirm, and verify items are removed from Trash.
9. Test cancel: Start a batch restore and then click Cancel — in-progress requests should be aborted and UI should show Cancelled for remaining items.
10. Test concurrency (backend): Trigger two concurrent restore requests for the same trash item and verify that only one succeeds while the other fails (404 or 409).
## Notes
- For AI-related integration tests, prefer mocking or an adapter to external LLM providers to ensure deterministic tests and avoid quota/cost issues.
- Never commit API keys; use environment variables or CI secrets for real integration tests.
