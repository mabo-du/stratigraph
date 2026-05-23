import React, { useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface DropzoneProps {
  onFileLoaded: (file: File) => void;
  title: string;
  accept?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileLoaded, title, accept = '.csv' }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileLoaded(e.dataTransfer.files[0]);
    }
  }, [onFileLoaded]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileLoaded(e.target.files[0]);
    }
  }, [onFileLoaded]);

  const inputId = `file-upload-${title.replace(/\s+/g, '-')}`;

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        minHeight: '160px',
        borderRadius: 'var(--radius)',
        border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border-2)'}`,
        background: isDragging ? 'var(--accent-dim)' : 'var(--surface-2)',
        transition: 'border-color 0.2s, background 0.2s',
        cursor: 'pointer',
      }}
      onClick={() => document.getElementById(inputId)?.click()}
    >
      <UploadCloud
        size={36}
        style={{
          marginBottom: '0.75rem',
          color: isDragging ? 'var(--accent)' : 'var(--text-2)',
          transition: 'color 0.2s',
        }}
      />
      <p style={{ color: 'var(--text)', fontWeight: 500, marginBottom: '0.25rem' }}>
        {title}
      </p>
      <p style={{ color: 'var(--text-2)', fontSize: '0.82rem', marginBottom: '1rem', textAlign: 'center' }}>
        Drag and drop your CSV, or click to browse
      </p>
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: 'none' }}
        id={inputId}
        onClick={e => e.stopPropagation()}
      />
      <span
        style={{
          background: 'var(--surface-3)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text)',
          padding: '6px 14px',
          fontSize: '0.82rem',
          fontWeight: 500,
          pointerEvents: 'none',
        }}
      >
        Browse Files
      </span>
    </div>
  );
};
