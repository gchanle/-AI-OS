'use client';
import { useState } from 'react';
import { externalOpenModes } from '@/data/workspace';
import './ExternalOpenModeControl.css';

export default function ExternalOpenModeControl({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const activeMode = externalOpenModes.find((item) => item.id === value) || externalOpenModes[0];

    return (
        <div className="external-mode-control">
            <button
                className="external-mode-button"
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                title="设置打开方式"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c0 .7.41 1.33 1.05 1.6.15.06.3.1.46.1H21a2 2 0 0 1 0 4h-.09c-.16 0-.31.03-.46.1-.64.27-1.05.9-1.05 1.6Z" />
                </svg>
                <span>{activeMode.label}</span>
            </button>

            {open && (
                <>
                    <div className="external-mode-overlay" onClick={() => setOpen(false)} />
                    <div className="external-mode-menu glass-strong">
                        <div className="external-mode-title">打开方式</div>
                        {externalOpenModes.map((mode) => (
                            <button
                                key={mode.id}
                                className={`external-mode-item ${mode.id === value ? 'active' : ''}`}
                                type="button"
                                onClick={() => {
                                    onChange(mode.id);
                                    setOpen(false);
                                }}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
