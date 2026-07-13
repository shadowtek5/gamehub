import { NextResponse } from "next/server";

// Hand-curated OpenAPI 3 spec for the GameHub API — served to Swagger UI at
// /api-docs. Authenticate with a personal token from /account (Bearer) or
// the browser session cookie.

const BrowseRom = {
  type: "object",
  properties: {
    id: { type: "integer" },
    title: { type: "string" },
    boxart_url: { type: "string", nullable: true },
    platform_slug: { type: "string" },
    variant: { type: "string", nullable: true },
    language: { type: "string", nullable: true, example: "En,Fr,De" },
    added_at: { type: "string" },
    favorite: { type: "integer" },
    play_status: { type: "string" },
    playtime_seconds: { type: "integer" },
  },
} as const;

const ScrapeOutcome = {
  type: "object",
  properties: {
    romId: { type: "integer" },
    title: { type: "string" },
    ok: { type: "boolean" },
    sources: { type: "array", items: { type: "string" } },
    got: { type: "array", items: { type: "string" } },
    error: { type: "string", nullable: true },
  },
} as const;

const spec = {
  openapi: "3.0.3",
  info: {
    title: "GameHub API",
    version: "1.0.0",
    description:
      "Self-hosted retro game library. Authenticate with `Authorization: Bearer <token>` using a personal API token created on your Account page, or with the browser session cookie.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "Personal API token (ghk_…)" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "gh_session" },
    },
    schemas: { BrowseRom, ScrapeOutcome },
  },
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  tags: [
    { name: "auth" },
    { name: "library" },
    { name: "games" },
    { name: "scanning" },
    { name: "scraping" },
    { name: "collections" },
    { name: "users", description: "Admin only" },
    { name: "profile" },
  ],
  paths: {
    "/api/heartbeat": {
      get: {
        tags: ["auth"],
        summary: "Server identity (public) + library totals (authenticated)",
        security: [],
        responses: { "200": { description: "{ name, version, games?, platforms?, user? }" } },
      },
    },
    "/api/users/me": {
      get: {
        tags: ["auth"],
        summary: "Who am I (works with tokens and cookies)",
        responses: { "200": { description: "{ id, username, role, displayName, avatarUrl }" } },
      },
    },
    "/api/stats": {
      get: {
        tags: ["library"],
        summary: "Library + personal stats",
        responses: { "200": { description: "Totals, per-platform counts, your playtime" } },
      },
    },
    "/api/platforms": {
      get: {
        tags: ["library"],
        summary: "Platforms with games or mapped folders",
        responses: {
          "200": { description: "{ platforms: [{slug, name, games, playable, hidden}] }" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Sign in (sets the session cookie)",
        security: [],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: { username: { type: "string" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Signed in" }, "401": { description: "Bad credentials" } },
      },
    },
    "/api/auth/logout": {
      post: { tags: ["auth"], summary: "Sign out", responses: { "200": { description: "OK" } } },
    },
    "/api/auth/password": {
      post: {
        tags: ["auth"],
        summary: "Change your password",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["current", "next"],
                properties: { current: { type: "string" }, next: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Changed" }, "403": { description: "Wrong current password" } },
      },
    },
    "/api/tokens": {
      get: {
        tags: ["auth"],
        summary: "List your API tokens",
        responses: { "200": { description: "Tokens (no secrets)" } },
      },
      post: {
        tags: ["auth"],
        summary: "Create an API token (value returned once)",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
        responses: { "200": { description: "{ token: 'ghk_…' }" } },
      },
    },
    "/api/tokens/{id}": {
      delete: {
        tags: ["auth"],
        summary: "Revoke a token",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Revoked" } },
      },
    },
    "/api/library": {
      get: {
        tags: ["library"],
        summary: "Browse the library (paged, filtered, searched in SQL)",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Title search" },
          {
            name: "tab",
            in: "query",
            schema: { type: "string", enum: ["favorites", "playing", "backlog", "beaten"] },
          },
          { name: "platform", in: "query", schema: { type: "string" }, description: "Platform slug (e.g. snes)" },
          { name: "variant", in: "query", schema: { type: "string" }, description: "'main' or a variant name (hacks, translations, …)" },
          { name: "genre", in: "query", schema: { type: "string" } },
          { name: "language", in: "query", schema: { type: "string" }, description: "No-Intro code (En, Ja, …)" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 150, maximum: 500 } },
        ],
        responses: {
          "200": {
            description: "Rows + total",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    rows: { type: "array", items: { $ref: "#/components/schemas/BrowseRom" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/roms/{id}": {
      get: {
        tags: ["games"],
        summary: "Read one game (metadata, media URLs, your personal data)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "{ rom }" }, "404": { description: "Not found" } },
      },
      patch: {
        tags: ["games"],
        summary: "Edit a game's metadata (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  platform_slug: { type: "string" },
                  region: { type: "string", nullable: true },
                  description: { type: "string", nullable: true },
                  developer: { type: "string", nullable: true },
                  publisher: { type: "string", nullable: true },
                  genre: { type: "string", nullable: true },
                  players: { type: "string", nullable: true },
                  rating: { type: "string", nullable: true },
                  release_date: { type: "string", nullable: true },
                  language: { type: "string", nullable: true },
                  boxart_url: { type: "string", nullable: true },
                  hero_url: { type: "string", nullable: true },
                  icon_url: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
    },
    "/api/roms/{id}/file": {
      get: {
        tags: ["games"],
        summary: "Download / stream the ROM file",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "download", in: "query", schema: { type: "integer", enum: [1] } },
        ],
        responses: { "200": { description: "File bytes" } },
      },
    },
    "/api/roms/{id}/favorite": {
      post: {
        tags: ["games"],
        summary: "Set favorite",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { favorite: { type: "boolean" } } },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/roms/{id}/scrape": {
      post: {
        tags: ["scraping"],
        summary: "Scrape one game (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  only: {
                    type: "string",
                    enum: ["description", "details", "boxart", "hero", "icon", "screenshot", "video", "manual"],
                    description: "Fetch just this item, ignoring global toggles",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Outcome",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ScrapeOutcome" } } },
          },
        },
      },
    },
    "/api/roms/{id}/rematch": {
      post: {
        tags: ["scraping"],
        summary: "Re-scrape forcing a picked provider match (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["gameId"],
                properties: {
                  provider: { type: "string", enum: ["screenscraper", "igdb", "launchbox"] },
                  gameId: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Outcome" } },
      },
    },
    "/api/roms/{id}/match-candidates": {
      get: {
        tags: ["scraping"],
        summary: "Search game databases by name (admin)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "q", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Candidates with provider + id" } },
      },
    },
    "/api/roms/{id}/fetch-video": {
      post: {
        tags: ["scraping"],
        summary: "Fetch just this game's video snap (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "{ ok, url?, source }" } },
      },
      get: {
        tags: ["scraping"],
        summary: "Poll live FTP download progress",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "{ phase, bytes, total }" } },
      },
    },
    "/api/roms/{id}/fetch-manual": {
      post: {
        tags: ["scraping"],
        summary: "Fetch just this game's PDF manual (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "{ ok, url?, source }" } },
      },
      get: {
        tags: ["scraping"],
        summary: "Poll live download progress",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "{ phase, bytes, total }" } },
      },
    },
    "/api/roms/{id}/personal": {
      post: {
        tags: ["games"],
        summary: "Your personal data for a game",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  notes: { type: "string", nullable: true },
                  rating: { type: "integer", minimum: 1, maximum: 10, nullable: true },
                  difficulty: { type: "integer", minimum: 1, maximum: 10, nullable: true },
                  completion: { type: "integer", minimum: 0, maximum: 100, nullable: true },
                  hidden: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Saved" } },
      },
    },
    "/api/roms/{id}/discs": {
      get: {
        tags: ["games"],
        summary: "Multi-disc game: all discs as one streamed zip",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "zip" }, "400": { description: "Not multi-disc" } },
      },
    },
    "/api/roms/{id}/states": {
      get: {
        tags: ["games"],
        summary: "Your save states for a game",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "States (newest first)" } },
      },
      post: {
        tags: ["games"],
        summary: "Upload a save state (multipart: state + optional screenshot)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Stored" } },
      },
    },
    "/api/states/{id}": {
      get: {
        tags: ["games"],
        summary: "Download a save state (?screenshot=1 for its screenshot)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "State bytes" } },
      },
      delete: {
        tags: ["games"],
        summary: "Delete one of your save states",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/api/roms/upload": {
      post: {
        tags: ["games"],
        summary: "Upload ROM files into a system's mapped folder (editor)",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  platform: { type: "string" },
                  files: { type: "array", items: { type: "string", format: "binary" } },
                },
              },
            },
          },
        },
        responses: { "200": { description: "{ saved, errors, scan }" } },
      },
    },
    "/api/hash/job": {
      get: { tags: ["scanning"], summary: "File-hash job status (admin)", responses: { "200": { description: "Status" } } },
      post: {
        tags: ["scanning"],
        summary: "Start hashing ROMs missing CRC/MD5/SHA1 (admin)",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", properties: { systems: { type: "array", items: { type: "string" } } } },
            },
          },
        },
        responses: { "200": { description: "Started" }, "409": { description: "Already running" } },
      },
      delete: { tags: ["scanning"], summary: "Cancel the hash job (admin)", responses: { "200": { description: "Cancelled" } } },
    },
    "/api/import/gamelist": {
      post: {
        tags: ["scanning"],
        summary: "Import ES-DE gamelist.xml metadata from mapped folders (editor, fill-gaps only)",
        responses: { "200": { description: "{ filesFound, gamesMatched, fieldsFilled }" } },
      },
    },
    "/api/invites": {
      get: { tags: ["users"], summary: "Active invite links + registration setting (admin)", responses: { "200": { description: "Invites" } } },
      post: {
        tags: ["users"],
        summary: "Create an invite ({ role }) or toggle registration ({ registrationOpen })",
        responses: { "200": { description: "{ token } or { registrationOpen }" } },
      },
      delete: {
        tags: ["users"],
        summary: "Revoke an invite (?token=)",
        parameters: [{ name: "token", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Revoked" } },
      },
    },
    "/api/scan": {
      post: {
        tags: ["scanning"],
        summary: "Scan the library (admin) — optionally only some systems",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { systems: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
        responses: { "200": { description: "{ scanned, added, updated, markedMissing, cleanup? }" } },
      },
    },
    "/api/scrape/job": {
      get: { tags: ["scraping"], summary: "Background scrape job status (admin)", responses: { "200": { description: "Status" } } },
      post: {
        tags: ["scraping"],
        summary: "Start a background scrape (admin)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  onlyMissing: { type: "boolean" },
                  systems: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Started" }, "409": { description: "Already running" } },
      },
      delete: { tags: ["scraping"], summary: "Cancel the running scrape (admin)", responses: { "200": { description: "Cancelled" } } },
    },
    "/api/cleanup": {
      get: {
        tags: ["scanning"],
        summary: "Preview cleanup (admin)",
        parameters: [{ name: "systems", in: "query", schema: { type: "string" }, description: "Comma-separated slugs" }],
        responses: { "200": { description: "{ missing, orphanMedia }" } },
      },
      post: {
        tags: ["scanning"],
        summary: "Remove missing games + media (admin)",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", properties: { systems: { type: "array", items: { type: "string" } } } },
            },
          },
        },
        responses: { "200": { description: "{ removedGames, removedMediaFolders }" } },
      },
    },
    "/api/collections": {
      get: { tags: ["collections"], summary: "List your collections", responses: { "200": { description: "Collections" } } },
      post: {
        tags: ["collections"],
        summary: "Create a collection",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" } } },
            },
          },
        },
        responses: { "200": { description: "Created" } },
      },
    },
    "/api/collections/{id}": {
      get: {
        tags: ["collections"],
        summary: "Read one collection (own or public) with its games",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "{ collection, roms }" } },
      },
      delete: {
        tags: ["collections"],
        summary: "Delete a collection you own",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Deleted" } },
      },
      post: {
        tags: ["collections"],
        summary: "Add or remove a game",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["romId", "action"],
                properties: { romId: { type: "integer" }, action: { type: "string", enum: ["add", "remove"] } },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/users": {
      get: { tags: ["users"], summary: "List users (admin)", responses: { "200": { description: "Users" } } },
      post: {
        tags: ["users"],
        summary: "Create a user (admin)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: {
                  username: { type: "string" },
                  password: { type: "string" },
                  isAdmin: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Created" } },
      },
    },
    "/api/users/{id}": {
      patch: {
        tags: ["users"],
        summary: "Update a user (admin): admin flag / reset password",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { isAdmin: { type: "boolean" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["users"],
        summary: "Delete a user and all their data (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/api/firmware": {
      get: {
        tags: ["scanning"],
        summary: "List firmware/BIOS files (with known-hash verification)",
        parameters: [{ name: "platform", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "{ firmware: [...], known: {...} }" } },
      },
      post: {
        tags: ["scanning"],
        summary: "Upload a firmware file (admin, multipart: platform + file)",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  platform: { type: "string" },
                  file: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Stored (MD5 computed)" } },
      },
    },
    "/api/firmware/{id}": {
      get: {
        tags: ["scanning"],
        summary: "Download one firmware file",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "File bytes" } },
      },
      delete: {
        tags: ["scanning"],
        summary: "Remove a firmware file (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Removed" } },
      },
    },
    "/api/firmware/pack/{slug}": {
      get: {
        tags: ["scanning"],
        summary: "A platform's firmware as a zip (what the in-browser player loads)",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "zip" }, "404": { description: "No firmware" } },
      },
    },
    "/api/profile": {
      patch: {
        tags: ["profile"],
        summary: "Update your profile",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  display_name: { type: "string", nullable: true },
                  real_name: { type: "string", nullable: true },
                  location: { type: "string", nullable: true },
                  theme: { type: "string", enum: ["default", "summer", "midnight"] },
                  status: { type: "string", enum: ["online", "away", "invisible"] },
                  featured_badge: { type: "string", nullable: true },
                  background_url: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(spec);
}
