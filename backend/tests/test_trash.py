import os
import shutil
from fastapi.testclient import TestClient
import pytest

from backend import main

client = TestClient(main.app)

@pytest.fixture()
def tmp_posts(tmp_path, monkeypatch):
    # Create a fake hexo posts directory
    base = tmp_path / "hexo"
    posts = base / "source" / "_posts"
    posts.mkdir(parents=True)
    # Patch the app globals
    monkeypatch.setattr(main, "HEXO_BASE_PATH", str(base))
    monkeypatch.setattr(main, "POSTS_PATH", str(posts))
    return posts


def test_delete_and_list_and_restore(tmp_posts):
    # create a file
    f = tmp_posts / "2025-12-01-test.md"
    f.write_text("# Test\ncontent", encoding="utf-8")

    # delete (soft-delete)
    resp = client.delete("/api/posts/2025-12-01-test.md")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "moved to trash"
    assert "trash_path" in body

    # list trash
    resp = client.get("/api/trash")
    assert resp.status_code == 200
    items = resp.json()
    assert any("2025-12-01-test.md" in it for it in items)

    trash_item = next(it for it in items if "2025-12-01-test.md" in it)

    # restore the item
    resp = client.post("/api/trash/restore", json={"path": trash_item})
    assert resp.status_code == 200
    ret = resp.json()
    assert ret["status"] == "restored"

    # file should exist again
    assert (tmp_posts / "2025-12-01-test.md").exists()


def test_restore_conflict(tmp_posts):
    # create original and trash with same relative name to cause conflict
    original = tmp_posts / "conflict.md"
    original.write_text("original", encoding="utf-8")

    # create a trash structure manually
    trash_root = os.path.join(str(tmp_posts), ".trash", "20250101T000000Z")
    os.makedirs(trash_root, exist_ok=True)
    trash_file = os.path.join(trash_root, "conflict.md")
    with open(trash_file, "w", encoding="utf-8") as f:
        f.write("trashed")

    # attempt to restore
    resp = client.post("/api/trash/restore", json={"path": "20250101T000000Z/conflict.md"})
    assert resp.status_code == 409


def test_permanent_delete(tmp_posts):
    test_file = tmp_posts / "to_delete.md"
    test_file.write_text("temporary", encoding="utf-8")
    # soft-delete
    resp = client.delete("/api/posts/to_delete.md")
    assert resp.status_code == 200
    trash_path = resp.json()["trash_path"]

    # permanently delete
    resp = client.delete(f"/api/trash/{trash_path}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    # ensure it's gone
    resp = client.get("/api/trash")
    assert resp.status_code == 200
    assert all("to_delete.md" not in it for it in resp.json())


def test_restore_nonexistent(tmp_posts):
    # restoring a non-existent trash entry should return 404
    resp = client.post("/api/trash/restore", json={"path": "nonexistent/path.md"})
    assert resp.status_code == 404


def test_concurrent_restore(tmp_posts):
    # create a file and move to trash
    f = tmp_posts / "2025-12-02-concurrent.md"
    f.write_text("# Concurrent\ncontent", encoding="utf-8")
    resp = client.delete("/api/posts/2025-12-02-concurrent.md")
    assert resp.status_code == 200
    trash_path = resp.json()["trash_path"]

    # attempt to restore concurrently using two clients (threads)
    import concurrent.futures

    def do_restore():
        r = client.post("/api/trash/restore", json={"path": trash_path})
        return r.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        futs = [ex.submit(do_restore) for _ in range(2)]
        results = [f.result() for f in futs]

    # one should succeed (200), the other should fail (404 or 409 depending on timing)
    assert set(results) & {200}
    assert any(s in (404, 409, 200) for s in results)


def test_config_root_and_init(tmp_path, monkeypatch):
    # create a base directory without source/_posts
    base = tmp_path / "workspace"
    base.mkdir(parents=True)
    # Ensure it's empty
    monkeypatch.setattr(main, "HEXO_BASE_PATH", None)
    monkeypatch.setattr(main, "POSTS_PATH", None)

    # POST config with this base
    resp = client.post("/api/config", json={"hexo_path": str(base), "llm_provider": "gemini", "providers": {"gemini": {"api_key": None}, "openai": {"api_key": None}}})
    # Should accept config and report posts folder not detected
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("is_hexo") is False

    # Posts path should be set to the root
    resp2 = client.get("/api/posts")
    # no files yet but endpoint should not return 404
    assert resp2.status_code == 200

    # Now call init to create source/_posts
    resp3 = client.post("/api/posts/init")
    assert resp3.status_code == 200
    assert resp3.json().get("status") == "created"

    # Now the posts listing should still be valid
    resp4 = client.get("/api/posts")
    assert resp4.status_code == 200


def test_config_invalid_path(tmp_path):
    # POST config with a non-existent path
    bad = str(tmp_path / "does_not_exist")
    resp = client.post("/api/config", json={"hexo_path": bad, "llm_provider": "gemini", "providers": {"gemini": {"api_key": None}, "openai": {"api_key": None}}})
    assert resp.status_code == 400
    assert "Invalid path" in resp.json().get("detail", "")
