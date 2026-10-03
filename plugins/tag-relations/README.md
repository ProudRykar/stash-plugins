# Stash Tag Relations

A Stash plugin for managing custom relationships between tags (similar/related).

## Features

- **Similar tags**: Bidirectional similarity relationships
- **Related tags**: Bidirectional related relationships
- **Separate SQLite database**: Does not modify Stash's database
- **GraphQL integration**: Uses Stash's public API only
- **Hook support**: Automatically cleans up on tag destroy/merge
- **Export/Import**: JSON backup and restore
- **Validation**: Check and repair broken relations

## Architecture

```
Stash UI (React)
    │
    ▼ runPluginOperation
Python Backend (external plugin)
    │
    ├── SQLite (tag_relations.db)
    │
    └── Stash GraphQL API
```

## Installation

1. Copy the plugin directory to your Stash plugins folder:
   ```
   ~/.config/stash/plugins/stash-tag-relations/
   ```

2. Restart Stash

3. No credentials need to be copied by hand. On every plugin run Stash passes
   the connection details in `server_connection`, and the backend authenticates
   against the GraphQL API using, in order of priority:
   - an explicit `api_key` supplied with the operation (optional override),
   - the API key of the running Stash instance read from `config.yml`
     (directory passed by Stash in `server_connection.Dir`),
   - the Stash session cookie passed in `server_connection.SessionCookie`.

   The Stash URL defaults to `127.0.0.1:<port>` from `server_connection`, and
   the database defaults to `backend/data/tag-relations.sqlite`.

## Usage

### Tag Page Integration

A "Related Tags" panel appears on each tag page showing:
- Similar tags
- Related tags
- Buttons to add new relations

### Standalone Page

Navigate to `/plugin/tag-relations` for:
- Full relation management
- Search and filter
- Export/Import JSON
- Validation and repair

## Operations

The Python backend supports these operations via `runPluginOperation`:

| Operation | Args | Description |
|-----------|------|-------------|
| `list_relations` | `{tag_id}` | Get similar/related tags for a tag |
| `create_relation` | `{tag_a_id, tag_b_id, relation_type}` | Create a new relation |
| `update_relation` | `{tag_a_id, tag_b_id, relation_type}` | Update relation type |
| `delete_relation` | `{tag_a_id, tag_b_id, relation_type}` | Delete a relation |
| `set_relations` | `{tag_id, similar_ids[], related_ids[]}` | Replace all relations for a tag |
| `validate_relations` | `{}` | Check all relations for validity |
| `remove_broken_relations` | `{}` | Delete relations pointing to non-existent tags |
| `export_relations` | `{}` | Export all relations as JSON |
| `import_relations` | `{relations[], overwrite?}` | Import relations from JSON |
| `get_stats` | `{}` | Get relation statistics |
| `find_tags` | `{search, per_page?}` | Search tags via Stash API |

## Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| `tag-destroy` | `Tag.Destroy.Post` | Delete all relations for the tag |
| `tag-merge` | `Tag.Merge.Post` | Rewrite relations from source to destination tag |

## Database Schema

```sql
CREATE TABLE tag_relations (
    tag_a_id INTEGER NOT NULL,
    tag_b_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL,  -- 'similar' or 'related'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tag_a_id, tag_b_id, relation_type),
    CHECK (tag_a_id < tag_b_id),
    CHECK (relation_type IN ('similar', 'related'))
);
```

Relations are stored canonically (smaller ID first) to ensure symmetry.

## Development

### Running Tests

```bash
cd backend
python -m pytest ../tests/ -v
```

### Project Structure

```
stash-tag-relations/
├── stash-tag-relations.yml      # Plugin manifest
├── backend/
│   ├── main.py                  # Entry point, operation dispatch
│   ├── config.py                # Configuration loading
│   ├── errors.py                # Custom exceptions
│   ├── models.py                # Data models
│   ├── db/
│   │   ├── database.py          # SQLite connection, migrations
│   │   └── repository.py        # Data access layer
│   ├── stash/
│   │   └── client.py            # Stash GraphQL client
│   └── services/
│       ├── relations.py         # Business logic
│       └── sync.py              # Hook handlers
├── ui/
│   ├── index.js                 # Plugin registration
│   ├── components/
│   │   ├── RelatedTagsPanel.jsx # Tag page panel
│   │   ├── RelationRow.jsx      # Single relation display
│   │   ├── AddRelationModal.jsx # Add relation dialog
│   │   └── TagRelationsPage.jsx # Standalone page
│   └── styles.css
└── tests/
    ├── test_database.py
    ├── test_repository.py
    ├── test_relations.py
    ├── test_stash_client.py
    └── test_migrations.py
```

## License

MIT