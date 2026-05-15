"use client";

/**
 * AppShell — MacTech application chrome.
 *
 * An upside-down "L" frame: the MacTech logo bay anchors the top-left
 * corner where the sidebar meets the topbar. Sidebar collapses to a
 * 64px icon rail (⌘B / Ctrl+B, persisted to localStorage). Topbar
 * stays anchored to the right of the logo bay. Below 768px the
 * sidebar becomes a sheet drawer over a backdrop.
 *
 * Composition
 *   <AppShell
 *     brand="MacTech"
 *     subname="Design System"
 *     sidebar={<>
 *       <AppShell.Section label="Workspace">
 *         <AppShell.Item icon={<Home/>} href="/" active>Overview</AppShell.Item>
 *       </AppShell.Section>
 *       <AppShell.Spacer />
 *       <AppShell.User name="Patrick" email="patrick@…" />
 *     </>}
 *     topbar={<AppShell.Topbar>
 *       <AppShell.Breadcrumbs items={[…]} />
 *       <AppShell.Search placeholder="Search…" />
 *       <AppShell.Actions>{…}</AppShell.Actions>
 *     </AppShell.Topbar>}
 *   >
 *     {pageContent}
 *   </AppShell>
 *
 * Mood-awareness
 *   All paint reads CSS variables (--mt-bg, --mt-surface-*, --mt-hairline,
 *   --mt-accent, --mt-text*, --mt-radius-*, --mt-border-width). Industrial
 *   automatically gets 2px borders; Editorial gets the serif wordmark.
 *
 * NB: this file is the registry SOURCE — it ships verbatim through
 * /r/app-shell.json. Consumers run `npx shadcn add` to drop it into
 * components/mactech/app-shell.tsx in their own app.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import NextLink from "next/link";
import { ChevronRight, PanelLeft, X } from "lucide-react";

// ────────────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────────────

interface ShellCtxValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
  sheetOpen: boolean;
  setSheetOpen: (v: boolean) => void;
  brand: string;
  subname: string | null;
  storageKey: string | null;
  /** Last hovered (x,y) in sidebar local coords, for the accent glow. */
  pointer: { x: number; y: number; on: boolean };
  setPointer: (p: { x: number; y: number; on: boolean }) => void;
}

const ShellCtx = createContext<ShellCtxValue | null>(null);
function useShell(): ShellCtxValue {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("AppShell.* must be used inside <AppShell>");
  return ctx;
}

// ────────────────────────────────────────────────────────────────
// MacTech mark — inline SVG, currentColor
// ────────────────────────────────────────────────────────────────

function MacTechMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      style={{ display: "block", color: "var(--mt-text)" }}
    >
      <path d="M6 58 L6 14 L22 6 L22 58 Z" fill="currentColor" />
      <path d="M22 6 L36 14 L36 58 L22 58 Z" fill="currentColor" fillOpacity="0.78" />
      <path d="M36 14 L58 26 L58 58 L36 58 Z" fill="currentColor" fillOpacity="0.55" />
      <path d="M22 6 L36 14 L22 14 Z" fill="currentColor" fillOpacity="0.92" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────
// Root
// ────────────────────────────────────────────────────────────────

export interface AppShellProps {
  /** Brand wordmark text. */
  brand?: string;
  /** Optional small line under the wordmark (e.g. tenant / workspace). */
  subname?: string;
  /** Destination for the corner brand link. Defaults to `/`. */
  brandHref?: string;
  /** Optional override for the corner mark. Defaults to the MacTech glyph. */
  logo?: ReactNode;
  /** Top bar contents. Pre-built blocks: AppShell.Breadcrumbs / Search / Actions. */
  topbar?: ReactNode;
  /** Sidebar contents. Use AppShell.Section / AppShell.Item / AppShell.User. */
  sidebar?: ReactNode;
  /** Initial collapsed state (uncontrolled). */
  defaultCollapsed?: boolean;
  /** Controlled collapsed state — pair with `onCollapsedChange`. */
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
  /** localStorage key for collapse persistence. `null` disables. */
  storageKey?: string | null;
  /** Sidebar width when expanded. Default 256. */
  width?: number;
  /** Sidebar width when collapsed to icon rail. Default 64. */
  railWidth?: number;
  /** Top bar height. Default 56. */
  topbarHeight?: number;
  /** Mobile breakpoint. Default 768. */
  breakpoint?: number;
  /** Pin to viewport vs flow-in-document. Default "viewport". */
  layout?: "viewport" | "fill";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const DEFAULT_STORAGE = "mt-app-shell-collapsed";

export function AppShell({
  brand = "MacTech",
  subname,
  brandHref = "/",
  logo,
  topbar,
  sidebar,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  storageKey = DEFAULT_STORAGE,
  width = 256,
  railWidth = 64,
  topbarHeight = 56,
  breakpoint = 768,
  layout = "viewport",
  className = "",
  style,
  children,
}: AppShellProps) {
  const [uncontrolled, setUncontrolled] = useState<boolean>(defaultCollapsed);
  const controlled = collapsedProp !== undefined;
  const collapsed = controlled ? (collapsedProp as boolean) : uncontrolled;

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolled(next);
      onCollapsedChange?.(next);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
    },
    [controlled, onCollapsedChange, storageKey],
  );
  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  // Hydrate persisted state once on mount (uncontrolled only)
  useEffect(() => {
    if (controlled || !storageKey) return;
    try {
      const v = localStorage.getItem(storageKey);
      // Hydration-safe: read persisted sidebar width after mount.
      /* eslint-disable react-hooks/set-state-in-effect -- persist hydration must follow SSR */
      if (v === "1") setUncontrolled(true);
      else if (v === "0") setUncontrolled(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* ignore */
    }
  }, [controlled, storageKey]);

  // ⌘B / Ctrl+B
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Mobile sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= breakpoint) setSheetOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const [pointer, setPointer] = useState({ x: 0, y: 0, on: false });

  const ctx = useMemo<ShellCtxValue>(
    () => ({
      collapsed,
      setCollapsed,
      toggle,
      sheetOpen,
      setSheetOpen,
      brand,
      subname: subname ?? null,
      storageKey,
      pointer,
      setPointer,
    }),
    [collapsed, setCollapsed, toggle, sheetOpen, brand, subname, storageKey, pointer],
  );

  const sideW = collapsed ? railWidth : width;
  const uid = useId().replace(/:/g, "");

  return (
    <ShellCtx.Provider value={ctx}>
      <div
        data-mt-app-shell=""
        data-collapsed={collapsed ? "true" : "false"}
        data-sheet-open={sheetOpen ? "true" : "false"}
        className={`mt-app-shell ${className}`}
        style={
          {
            // Grid columns set inline so var() interpolation quirks
            // don't stall the transition between 256px ↔ 64px.
            gridTemplateColumns: `${sideW}px 1fr`,
            ["--shell-w" as string]: `${sideW}px`,
            ["--shell-full-w" as string]: `${width}px`,
            ["--shell-rail-w" as string]: `${railWidth}px`,
            ["--shell-topbar-h" as string]: `${topbarHeight}px`,
            ["--shell-break" as string]: `${breakpoint}px`,
            ...style,
          } as CSSProperties
        }
      >
        {/* Corner — logo bay */}
        <div className="mt-as-corner" role="presentation">
          <NextLink className="mt-as-brand" href={brandHref} aria-label={brand}>
            <span className="mt-as-mark" aria-hidden="true">
              {logo ?? <MacTechMark size={22} />}
            </span>
            <span className="mt-as-brand-text" data-hide-on-collapsed="true">
              <span className="mt-as-brand-name">{brand}</span>
              {subname ? <span className="mt-as-brand-sub">{subname}</span> : null}
            </span>
          </NextLink>
          <span className="mt-as-corner-seam" aria-hidden="true" />
        </div>

        {/* Topbar */}
        <header className="mt-as-topbar" role="banner">
          <button
            type="button"
            className="mt-as-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-keyshortcuts="Meta+B Control+B"
            title="Toggle sidebar (⌘B)"
            onClick={() => {
              if (typeof window !== "undefined" && window.innerWidth < breakpoint) {
                setSheetOpen(!sheetOpen);
              } else {
                toggle();
              }
            }}
          >
            <PanelLeft size={16} />
          </button>
          <div className="mt-as-topbar-content">{topbar}</div>
        </header>

        {/* Sidebar */}
        <aside
          id={`shell-${uid}-sidebar`}
          className="mt-as-sidebar"
          role="complementary"
          aria-label="Primary navigation"
          onMouseMove={(e: MouseEvent<HTMLElement>) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPointer({ x: e.clientX - r.left, y: e.clientY - r.top, on: true });
          }}
          onMouseLeave={() => setPointer({ x: 0, y: 0, on: false })}
        >
          <div
            className="mt-as-sidebar-glow"
            aria-hidden="true"
            style={{
              opacity: pointer.on && !collapsed ? 1 : 0,
              ["--gx" as string]: `${pointer.x}px`,
              ["--gy" as string]: `${pointer.y}px`,
            } as CSSProperties}
          />
          <nav className="mt-as-sidebar-scroll" aria-label="Sidebar">
            {sidebar}
          </nav>
          {sheetOpen ? (
            <button
              type="button"
              className="mt-as-sheet-close"
              onClick={() => setSheetOpen(false)}
              aria-label="Close navigation"
            >
              <X size={14} />
            </button>
          ) : null}
        </aside>

        {/* Sheet backdrop (mobile) */}
        {sheetOpen ? (
          <button
            type="button"
            tabIndex={-1}
            className="mt-as-backdrop"
            aria-hidden="true"
            onClick={() => setSheetOpen(false)}
          />
        ) : null}

        {/* Content */}
        <main className="mt-as-content" role="main">
          {children}
        </main>

        <ScopedStyles layout={layout} breakpoint={breakpoint} />
      </div>
    </ShellCtx.Provider>
  );
}

// ────────────────────────────────────────────────────────────────
// Sidebar building blocks
// ────────────────────────────────────────────────────────────────

export interface SectionProps {
  label?: string;
  children?: ReactNode;
  className?: string;
}

function Section({ label, children, className = "" }: SectionProps) {
  const { collapsed } = useShell();
  return (
    <div className={`mt-as-section ${className}`} role="group" aria-label={label}>
      {label ? (
        collapsed ? (
          <span className="mt-as-section-sep" aria-hidden="true" />
        ) : (
          <p className="mt-as-section-label font-mt-mono">{label}</p>
        )
      ) : null}
      <ul className="mt-as-section-list">{children}</ul>
    </div>
  );
}

export interface ItemProps {
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  /** Numeric badge displayed on the right (or as a dot when collapsed). */
  count?: number | string;
  /** Pill text — e.g. "NEW". */
  badge?: string;
  disabled?: boolean;
  /** Keyboard shortcut hint, e.g. "G then D". Shown right-aligned. */
  shortcut?: string;
  children?: ReactNode;
}

function Item({
  icon,
  href,
  onClick,
  active,
  count,
  badge,
  disabled,
  shortcut,
  children,
}: ItemProps) {
  const { collapsed } = useShell();
  const [hover, setHover] = useState(false);
  const showTip = collapsed && hover && !disabled;

  const inner = (
    <>
      <span className="mt-as-item-rail" aria-hidden="true" />
      {icon ? (
        <span className="mt-as-item-icon" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <span className="mt-as-item-icon" aria-hidden="true" />
      )}
      <span className="mt-as-item-label" data-hide-on-collapsed="true">
        {children}
      </span>
      {!collapsed && badge ? (
        <span className="mt-as-item-badge font-mt-mono">{badge}</span>
      ) : null}
      {!collapsed && shortcut ? (
        <span className="mt-as-item-shortcut font-mt-mono">{shortcut}</span>
      ) : null}
      {!collapsed && count != null ? (
        <span className="mt-as-item-count font-mt-mono">{count}</span>
      ) : null}
      {collapsed && count != null ? (
        <span className="mt-as-item-dot" aria-hidden="true" />
      ) : null}
    </>
  );

  const sharedProps = {
    className: "mt-as-item",
    "data-active": active ? "true" : "false",
    "data-disabled": disabled ? "true" : "false",
    "aria-current": active ? ("page" as const) : undefined,
    "aria-disabled": disabled || undefined,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onFocus: () => setHover(true),
    onBlur: () => setHover(false),
  };

  return (
    <li className="mt-as-item-wrap">
      {href && !disabled ? (
        /^https?:\/\//.test(href) || href.startsWith("//") ? (
          <a href={href} {...sharedProps} onClick={onClick} rel="noopener noreferrer">
            {inner}
          </a>
        ) : (
          <NextLink href={href} {...sharedProps} onClick={onClick} scroll>
            {inner}
          </NextLink>
        )
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          {...sharedProps}
        >
          {inner}
        </button>
      )}
      {showTip ? (
        <span className="mt-as-tooltip font-mt-mono" role="tooltip">
          {children}
          {count != null ? <span className="mt-as-tooltip-count">{count}</span> : null}
        </span>
      ) : null}
    </li>
  );
}

export interface UserProps {
  name: string;
  email?: string;
  role?: string;
  avatar?: ReactNode;
  onClick?: () => void;
}

function User({ name, email, role, avatar, onClick }: UserProps) {
  const { collapsed } = useShell();
  const initial = name.charAt(0).toUpperCase();
  return (
    <button
      type="button"
      className="mt-as-user"
      onClick={onClick}
      aria-label={`Account menu, ${name}`}
    >
      <span className="mt-as-user-avatar" aria-hidden="true">
        {avatar ?? <span className="font-mt-mono">{initial}</span>}
      </span>
      {!collapsed ? (
        <span className="mt-as-user-meta">
          <span className="mt-as-user-name">{name}</span>
          <span className="mt-as-user-sub">{role ?? email ?? ""}</span>
        </span>
      ) : null}
      {!collapsed ? (
        <ChevronRight size={14} className="mt-as-user-chev" aria-hidden="true" />
      ) : null}
    </button>
  );
}

function Spacer() {
  return <div className="mt-as-spacer" aria-hidden="true" />;
}

// ────────────────────────────────────────────────────────────────
// Topbar building blocks
// ────────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mt-as-crumbs">
      <ol>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className="mt-as-crumb">
              {!last && it.href ? (
                /^https?:\/\//.test(it.href) || it.href.startsWith("//") ? (
                  <a href={it.href} className="mt-as-crumb-link">
                    {it.label}
                  </a>
                ) : (
                  <NextLink href={it.href} className="mt-as-crumb-link">
                    {it.label}
                  </NextLink>
                )
              ) : !last ? (
                <span className="mt-as-crumb-parent">{it.label}</span>
              ) : (
                <span
                  className="mt-as-crumb-current"
                  aria-current={last ? "page" : undefined}
                >
                  {it.label}
                </span>
              )}
              {!last ? (
                <ChevronRight size={12} className="mt-as-crumb-sep" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface SearchProps {
  placeholder?: string;
  shortcut?: string;
  onClick?: () => void;
}

function Search({ placeholder = "Search…", shortcut = "⌘K", onClick }: SearchProps) {
  return (
    <button type="button" className="mt-as-search" onClick={onClick}>
      <svg
        viewBox="0 0 16 16"
        width={14}
        height={14}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M13.5 13.5 L10.2 10.2" strokeLinecap="round" />
      </svg>
      <span className="mt-as-search-placeholder">{placeholder}</span>
      <span className="mt-as-search-kbd font-mt-mono">{shortcut}</span>
    </button>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-as-actions">{children}</div>;
}

function Topbar({ children }: { children: ReactNode }) {
  return <div className="mt-as-topbar-row">{children}</div>;
}

// ────────────────────────────────────────────────────────────────
// Static-method API
// ────────────────────────────────────────────────────────────────

AppShell.Section = Section;
AppShell.Item = Item;
AppShell.User = User;
AppShell.Spacer = Spacer;
AppShell.Topbar = Topbar;
AppShell.Breadcrumbs = Breadcrumbs;
AppShell.Search = Search;
AppShell.Actions = Actions;
AppShell.Mark = MacTechMark;

// ────────────────────────────────────────────────────────────────
// Scoped styles
// ────────────────────────────────────────────────────────────────

function ScopedStyles({
  layout,
  breakpoint,
}: {
  layout: "viewport" | "fill";
  breakpoint: number;
}) {
  // Inline <style> keeps the component a single shipped file — no
  // adopter has to wire up a Tailwind plugin or import a CSS module.
  return (
    <style>{`
      .mt-app-shell {
        --_topbar-h: var(--shell-topbar-h, 56px);
        --_side-w:   var(--shell-w, 256px);
        --_bw:       var(--mt-border-width, 1px);
        display: grid;
        grid-template-columns: var(--_side-w) 1fr;
        grid-template-rows: var(--_topbar-h) 1fr;
        grid-template-areas:
          "corner topbar"
          "side   content";
        ${layout === "viewport" ? "height: 100vh; height: 100dvh;" : "height: 100%; min-height: 0;"}
        width: 100%;
        background: var(--mt-bg);
        color: var(--mt-text);
        font-family: var(--mt-font-sans);
        transition: grid-template-columns 220ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
        isolation: isolate;
        position: relative;
        overflow: hidden;
      }
      @media (prefers-reduced-motion: reduce) {
        .mt-app-shell, .mt-app-shell * { transition: none !important; animation: none !important; }
      }

      /* Corner ─────────────────────────────────────────────────── */
      .mt-app-shell .mt-as-corner {
        grid-area: corner;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding-inline: 16px;
        border-right: var(--_bw) solid var(--mt-hairline);
        border-bottom: var(--_bw) solid var(--mt-hairline);
        background: var(--mt-surface-1);
        min-width: 0;
        overflow: hidden;
      }
      .mt-app-shell[data-collapsed="true"] .mt-as-corner {
        justify-content: center;
        padding-inline: 0;
      }
      .mt-app-shell .mt-as-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: var(--mt-text);
        text-decoration: none;
        min-width: 0;
        outline: none;
        border-radius: var(--mt-radius-2, 8px);
        padding: 4px 6px;
        margin: -4px -6px;
      }
      .mt-app-shell .mt-as-brand:focus-visible {
        box-shadow: 0 0 0 2px var(--mt-bg), 0 0 0 4px var(--mt-accent);
      }
      .mt-app-shell .mt-as-mark {
        display: inline-grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: var(--mt-radius-1, 6px);
        background:
          radial-gradient(120% 120% at 30% 20%, var(--mt-soft-accent, rgba(255,255,255,0.06)), transparent 70%),
          var(--mt-surface-3, rgba(255,255,255,0.06));
        border: var(--_bw) solid var(--mt-hairline-2, var(--mt-hairline));
        flex-shrink: 0;
        transition: transform 220ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
      }
      .mt-app-shell .mt-as-brand:hover .mt-as-mark { transform: rotate(-3deg) scale(1.04); }
      .mt-app-shell .mt-as-brand-text {
        display: inline-flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.05;
      }
      .mt-app-shell .mt-as-brand-name {
        font-weight: 600;
        font-size: 14px;
        letter-spacing: -0.01em;
        color: var(--mt-text);
        white-space: nowrap;
      }
      .mt-app-shell .mt-as-brand-sub {
        font-family: var(--mt-font-mono);
        font-size: 9.5px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--mt-text-3);
        white-space: nowrap;
        margin-top: 3px;
      }
      .mt-app-shell .mt-as-corner-seam {
        position: absolute;
        right: -1px;
        top: 30%;
        bottom: 30%;
        width: 1px;
        background: linear-gradient(to bottom, transparent, var(--mt-accent), transparent);
        opacity: 0.35;
        pointer-events: none;
      }
      [data-mt-mood="editorial"] .mt-app-shell .mt-as-brand-name {
        font-family: var(--mt-font-serif);
        font-weight: 500;
        font-size: 17px;
        letter-spacing: -0.02em;
      }
      [data-mt-mood="industrial"] .mt-app-shell .mt-as-brand-name {
        font-family: var(--mt-font-mono);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
      }

      /* Hide-on-collapsed helper */
      .mt-app-shell[data-collapsed="true"] [data-hide-on-collapsed="true"] {
        opacity: 0;
        pointer-events: none;
        max-width: 0;
        overflow: hidden;
        white-space: nowrap;
      }
      [data-hide-on-collapsed="true"] {
        transition: opacity 160ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)),
                    max-width 220ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
        max-width: 220px;
      }

      /* Topbar ─────────────────────────────────────────────────── */
      .mt-app-shell .mt-as-topbar {
        grid-area: topbar;
        display: flex;
        align-items: center;
        gap: 8px;
        padding-inline: 12px;
        border-bottom: var(--_bw) solid var(--mt-hairline);
        background: var(--mt-bg);
        background-image:
          linear-gradient(to bottom, var(--mt-surface-1) 0%, transparent 100%);
        backdrop-filter: blur(6px);
        min-width: 0;
      }
      .mt-app-shell .mt-as-topbar-content {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .mt-app-shell .mt-as-topbar-row {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 12px;
        justify-content: space-between;
      }
      .mt-app-shell .mt-as-toggle {
        display: inline-grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: var(--mt-radius-2, 8px);
        border: var(--_bw) solid transparent;
        background: transparent;
        color: var(--mt-text-3);
        cursor: pointer;
        transition: background 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)), color 140ms;
      }
      .mt-app-shell .mt-as-toggle:hover {
        background: var(--mt-surface-2);
        color: var(--mt-text);
      }
      .mt-app-shell .mt-as-toggle:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--mt-bg), 0 0 0 4px var(--mt-accent);
      }

      /* Sidebar ────────────────────────────────────────────────── */
      .mt-app-shell .mt-as-sidebar {
        grid-area: side;
        position: relative;
        background: var(--mt-bg);
        border-right: var(--_bw) solid var(--mt-hairline);
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
        z-index: 5;
      }
      .mt-app-shell .mt-as-sidebar-glow {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
          220px 220px at var(--gx, 50%) var(--gy, 50%),
          var(--mt-soft-accent, rgba(255,255,255,0.06)),
          transparent 70%
        );
        transition: opacity 220ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
        opacity: 0;
        mix-blend-mode: plus-lighter;
      }
      [data-mt-mood="quiet"] .mt-app-shell .mt-as-sidebar-glow,
      [data-mt-mood="industrial"] .mt-app-shell .mt-as-sidebar-glow {
        mix-blend-mode: normal;
        opacity: 0;
      }
      .mt-app-shell .mt-as-sidebar-scroll {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 12px 8px;
        scrollbar-width: thin;
        scrollbar-color: var(--mt-hairline-2, var(--mt-hairline)) transparent;
        position: relative;
        z-index: 1;
      }
      .mt-app-shell .mt-as-sidebar-scroll::-webkit-scrollbar { width: 8px; }
      .mt-app-shell .mt-as-sidebar-scroll::-webkit-scrollbar-thumb {
        background: var(--mt-hairline-2, var(--mt-hairline));
        border-radius: 4px;
      }

      /* Sections ───────────────────────────────────────────────── */
      .mt-app-shell .mt-as-section { padding-block: 6px 10px; }
      .mt-app-shell .mt-as-section:first-child { padding-top: 0; }
      .mt-app-shell .mt-as-section-label {
        margin: 0;
        padding: 8px 10px 6px;
        font-size: 10px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--mt-text-4);
      }
      .mt-app-shell .mt-as-section-sep {
        display: block;
        height: 1px;
        margin: 8px 12px;
        background: var(--mt-hairline);
      }
      .mt-app-shell .mt-as-section-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 2px;
      }

      /* Item ───────────────────────────────────────────────────── */
      .mt-app-shell .mt-as-item-wrap { position: relative; }
      .mt-app-shell .mt-as-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 10px;
        border-radius: var(--mt-radius-2, 8px);
        border: 0;
        background: transparent;
        color: var(--mt-text-2);
        font: inherit;
        font-size: 13.5px;
        font-weight: 500;
        text-decoration: none;
        cursor: pointer;
        text-align: left;
        transition: background 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)),
                    color 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)),
                    transform 80ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
      }
      .mt-app-shell[data-collapsed="true"] .mt-as-item {
        justify-content: center;
        padding: 10px 0;
      }
      .mt-app-shell .mt-as-item:hover {
        background: var(--mt-surface-1);
        color: var(--mt-text);
      }
      .mt-app-shell .mt-as-item:active { transform: translateY(1px); }
      .mt-app-shell .mt-as-item:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 1px var(--mt-accent), 0 0 0 2px var(--mt-bg) inset;
      }
      .mt-app-shell .mt-as-item[data-active="true"] {
        background: var(--mt-soft-accent, var(--mt-surface-2));
        color: var(--mt-text);
        font-weight: 600;
      }
      .mt-app-shell .mt-as-item[data-disabled="true"] {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
      }

      .mt-app-shell .mt-as-item-rail {
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%) scaleY(0.4);
        width: 3px;
        height: 18px;
        border-radius: 0 3px 3px 0;
        background: var(--mt-accent);
        opacity: 0;
        transition: opacity 180ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)),
                    transform 220ms var(--mt-ease-spring, cubic-bezier(0.34,1.56,0.64,1));
        box-shadow: 0 0 12px var(--mt-glow, transparent);
      }
      .mt-app-shell .mt-as-item[data-active="true"] .mt-as-item-rail {
        opacity: 1;
        transform: translateY(-50%) scaleY(1);
      }
      .mt-app-shell[data-collapsed="true"] .mt-as-item-rail {
        left: 50%;
        top: auto;
        bottom: 2px;
        transform: translateX(-50%) scaleX(0.4);
        width: 18px;
        height: 3px;
        border-radius: 3px 3px 0 0;
      }
      .mt-app-shell[data-collapsed="true"] .mt-as-item[data-active="true"] .mt-as-item-rail {
        transform: translateX(-50%) scaleX(1);
      }

      .mt-app-shell .mt-as-item-icon {
        display: inline-grid;
        place-items: center;
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: currentColor;
      }
      .mt-app-shell .mt-as-item-icon svg { display: block; }
      .mt-app-shell .mt-as-item[data-active="true"] .mt-as-item-icon { color: var(--mt-accent); }
      .mt-app-shell .mt-as-item-label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mt-app-shell .mt-as-item-count {
        display: inline-grid;
        place-items: center;
        min-width: 20px;
        height: 18px;
        padding: 0 6px;
        border-radius: 999px;
        background: var(--mt-surface-2);
        border: var(--_bw) solid var(--mt-hairline);
        color: var(--mt-text-3);
        font-size: 10px;
        letter-spacing: 0.05em;
      }
      .mt-app-shell .mt-as-item[data-active="true"] .mt-as-item-count {
        background: var(--mt-accent);
        color: var(--mt-on-accent);
        border-color: transparent;
      }
      .mt-app-shell .mt-as-item-badge {
        display: inline-grid;
        place-items: center;
        height: 16px;
        padding: 0 6px;
        border-radius: var(--mt-radius-1, 6px);
        background: var(--mt-soft-accent, var(--mt-surface-2));
        color: var(--mt-accent);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      .mt-app-shell .mt-as-item-shortcut {
        color: var(--mt-text-4);
        font-size: 10px;
        letter-spacing: 0.06em;
      }
      .mt-app-shell .mt-as-item-dot {
        position: absolute;
        top: 6px;
        right: 12px;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: var(--mt-accent);
        box-shadow: 0 0 0 2px var(--mt-bg);
      }

      /* Tooltip when collapsed */
      .mt-app-shell .mt-as-tooltip {
        position: absolute;
        left: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
        z-index: 30;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: var(--mt-text);
        color: var(--mt-bg);
        border-radius: var(--mt-radius-2, 8px);
        font-size: 11px;
        letter-spacing: 0.05em;
        white-space: nowrap;
        box-shadow: 0 12px 32px rgba(0,0,0,0.18);
        pointer-events: none;
        animation: mt-as-tip 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
      }
      .mt-app-shell .mt-as-tooltip-count {
        font-size: 10px;
        opacity: 0.7;
      }
      @keyframes mt-as-tip {
        from { opacity: 0; transform: translate(-4px, -50%); }
        to   { opacity: 1; transform: translate(0,    -50%); }
      }

      /* User chip */
      .mt-app-shell .mt-as-spacer { flex: 1 1 auto; }
      .mt-app-shell .mt-as-user {
        display: flex;
        align-items: center;
        gap: 10px;
        width: calc(100% - 16px);
        margin: 4px 8px 8px;
        padding: 8px 10px;
        border-radius: var(--mt-radius-2, 8px);
        border: var(--_bw) solid var(--mt-hairline);
        background: var(--mt-surface-1);
        color: var(--mt-text);
        cursor: pointer;
        text-align: left;
        font: inherit;
        transition: background 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)),
                    border-color 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
      }
      .mt-app-shell[data-collapsed="true"] .mt-as-user {
        width: 40px;
        height: 40px;
        margin: 4px auto 8px;
        padding: 0;
        justify-content: center;
      }
      .mt-app-shell .mt-as-user:hover {
        background: var(--mt-surface-2);
        border-color: var(--mt-hairline-2, var(--mt-hairline));
      }
      .mt-app-shell .mt-as-user:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--mt-bg), 0 0 0 4px var(--mt-accent);
      }
      .mt-app-shell .mt-as-user-avatar {
        display: inline-grid;
        place-items: center;
        width: 26px;
        height: 26px;
        flex-shrink: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--mt-accent), var(--mt-accent-2, var(--mt-accent)));
        color: var(--mt-on-accent);
        font-size: 11px;
        font-weight: 700;
      }
      .mt-app-shell .mt-as-user-meta {
        display: inline-flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
        line-height: 1.15;
      }
      .mt-app-shell .mt-as-user-name {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--mt-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mt-app-shell .mt-as-user-sub {
        font-size: 10.5px;
        color: var(--mt-text-3);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mt-app-shell .mt-as-user-chev { color: var(--mt-text-4); flex-shrink: 0; }

      /* Breadcrumbs */
      .mt-app-shell .mt-as-crumbs ol {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .mt-app-shell .mt-as-crumb {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        min-width: 0;
      }
      .mt-app-shell .mt-as-crumb-link {
        color: var(--mt-text-3);
        text-decoration: none;
        border-radius: var(--mt-radius-1, 6px);
        padding: 2px 6px;
        margin: -2px -6px;
        transition: color 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)),
                    background 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
        white-space: nowrap;
      }
      .mt-app-shell .mt-as-crumb-link:hover {
        color: var(--mt-text);
        background: var(--mt-surface-2);
      }
      .mt-app-shell .mt-as-crumb-current {
        color: var(--mt-text);
        font-weight: 600;
        white-space: nowrap;
      }
      .mt-app-shell .mt-as-crumb-parent {
        color: var(--mt-text-3);
        font-weight: 500;
        white-space: nowrap;
        padding: 2px 6px;
        margin: -2px -6px;
      }
      .mt-app-shell .mt-as-crumb-sep { color: var(--mt-text-4); flex-shrink: 0; }

      /* Search */
      .mt-app-shell .mt-as-search {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 32px;
        padding: 0 10px;
        border-radius: var(--mt-radius-2, 8px);
        border: var(--_bw) solid var(--mt-hairline);
        background: var(--mt-surface-1);
        color: var(--mt-text-3);
        font: inherit;
        font-size: 13px;
        min-width: 200px;
        cursor: pointer;
        transition: background 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)),
                    border-color 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1)),
                    color 140ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
      }
      .mt-app-shell .mt-as-search:hover {
        background: var(--mt-surface-2);
        border-color: var(--mt-hairline-2, var(--mt-hairline));
        color: var(--mt-text-2);
      }
      .mt-app-shell .mt-as-search:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--mt-bg), 0 0 0 4px var(--mt-accent);
      }
      .mt-app-shell .mt-as-search-placeholder { flex: 1; text-align: left; }
      .mt-app-shell .mt-as-search-kbd {
        display: inline-grid;
        place-items: center;
        min-width: 22px;
        height: 18px;
        padding: 0 5px;
        border-radius: 4px;
        background: var(--mt-bg);
        border: var(--_bw) solid var(--mt-hairline);
        font-size: 9.5px;
        color: var(--mt-text-3);
        letter-spacing: 0.04em;
      }

      .mt-app-shell .mt-as-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      /* Content ────────────────────────────────────────────────── */
      .mt-app-shell .mt-as-content {
        grid-area: content;
        min-width: 0;
        min-height: 0;
        overflow: auto;
        position: relative;
      }

      /* Sheet (mobile) ─────────────────────────────────────────── */
      .mt-app-shell .mt-as-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.40);
        backdrop-filter: blur(2px);
        z-index: 20;
        border: 0;
        padding: 0;
        cursor: pointer;
        display: none;
      }
      .mt-app-shell .mt-as-sheet-close {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 2;
        width: 28px;
        height: 28px;
        display: none;
        place-items: center;
        border-radius: 999px;
        border: var(--_bw) solid var(--mt-hairline);
        background: var(--mt-surface-2);
        color: var(--mt-text-2);
        cursor: pointer;
      }

      @media (max-width: ${breakpoint - 1}px) {
        .mt-app-shell {
          grid-template-columns: 0 1fr;
          grid-template-areas:
            "corner topbar"
            "content content";
        }
        .mt-app-shell .mt-as-corner {
          display: none;
        }
        .mt-app-shell .mt-as-topbar { padding-left: 12px; border-left: 0; }
        .mt-app-shell .mt-as-sidebar {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: min(320px, 85vw);
          transform: translateX(-100%);
          transition: transform 240ms var(--mt-ease-out, cubic-bezier(0.22,1,0.36,1));
          border-right: var(--_bw) solid var(--mt-hairline);
          z-index: 30;
          background: var(--mt-bg);
        }
        .mt-app-shell[data-sheet-open="true"] .mt-as-sidebar { transform: translateX(0); }
        .mt-app-shell[data-sheet-open="true"] .mt-as-backdrop { display: block; }
        .mt-app-shell[data-sheet-open="true"] .mt-as-sheet-close { display: grid; }
        .mt-app-shell .mt-as-sidebar-scroll { padding-top: 48px; }
      }
    `}</style>
  );
}
