import React from 'react';
import { CavalStudioHero } from '../brand/CavaloHorseMark';

export interface RoboticsWelcomeProps {
  onOpenFolder: () => void;
  /** Optional — not shown unless provided (demo is never the default path). */
  onDemoMode?: () => void;
}

/**
 * Center-stage guidance when Robotics is open without a project folder.
 * Lives under engineering/ (no parallel robotics/ tree).
 */
export function RoboticsWelcome({ onOpenFolder, onDemoMode }: RoboticsWelcomeProps) {
  return (
    <div
      data-testid="robotics-welcome"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        padding: '32px 28px',
        textAlign: 'center',
        minHeight: 0,
        background: '#0D1117',
        overflowY: 'auto',
      }}
    >
      <CavalStudioHero size={160} />
      <h2
        style={{
          margin: '12px 0 6px',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--caval-text)',
        }}
      >
        ROBOTICS AI ENGINE
      </h2>
      <p
        style={{
          margin: '0 0 22px',
          fontSize: 12.5,
          color: 'var(--caval-text-muted)',
          lineHeight: 1.5,
          maxWidth: 420,
        }}
      >
        Creează piese 3D din descrieri text, gata de printat. Pentru STL și G-code ai nevoie de un
        folder de proiect.
      </p>

      <div
        style={{
          textAlign: 'left',
          width: '100%',
          maxWidth: 420,
          marginBottom: 22,
          padding: '16px 18px',
          borderRadius: 10,
          border: '1px solid var(--caval-border)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--caval-text-muted)',
            marginBottom: 12,
          }}
        >
          Cum funcționează
        </div>
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            color: 'var(--caval-text)',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <li>
            <strong>Deschide un folder</strong> de proiect
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--caval-text-muted)',
                marginTop: 3,
              }}
            >
              Aici se salvează fișierele STL și setările de print
            </span>
          </li>
          <li>
            <strong>Scrie ce vrei să construiești</strong> în chat-ul din dreapta
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--caval-text-muted)',
                marginTop: 3,
              }}
            >
              Ex: „suport telefon bicicletă, rezistent la vibrații”
            </span>
          </li>
          <li>
            <strong>Apasă Generează</strong>, apoi <strong>Generează STL</strong>
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--caval-text-muted)',
                marginTop: 3,
              }}
            >
              Planul apare în centru; CAD & Print rulează Zoo / OpenSCAD / Trellis
            </span>
          </li>
        </ol>
      </div>

      <button
        type="button"
        data-testid="robotics-welcome-open-folder"
        onClick={onOpenFolder}
        style={{
          padding: '11px 22px',
          borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(135deg, rgba(0,224,255,0.95), rgba(0,180,220,0.9))',
          color: '#0E0E0F',
          fontWeight: 700,
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        Deschide Folder
      </button>

      {onDemoMode ? (
        <div
          style={{
            marginTop: 22,
            paddingTop: 18,
            borderTop: '1px solid var(--caval-border)',
            width: '100%',
            maxWidth: 420,
          }}
        >
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 12,
              color: 'var(--caval-text-muted)',
            }}
          >
            Vrei să testezi fără folder?
          </p>
          <button
            type="button"
            data-testid="robotics-welcome-demo"
            onClick={onDemoMode}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'transparent',
              color: 'var(--caval-text-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Mod Demo (fără salvare)
          </button>
        </div>
      ) : null}
    </div>
  );
}
