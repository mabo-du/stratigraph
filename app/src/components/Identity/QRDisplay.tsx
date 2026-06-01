import React, { useState } from 'react';
import QRCode from 'qrcode';
import { LucideQrCode } from 'lucide-react';

interface QRDisplayProps {
  publicKey: Uint8Array;
  projectCode: string;
}

export const QRDisplay: React.FC<QRDisplayProps> = ({ publicKey, projectCode }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  React.useEffect(() => {
    // Convert Uint8Array to base64
    const pkBase64 = btoa(String.fromCharCode(...publicKey));
    const payload = `stratigraph://peer/v3?pk=${encodeURIComponent(pkBase64)}&proj=${encodeURIComponent(projectCode)}`;
    
    QRCode.toDataURL(payload, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error("Failed to generate QR code", err));
  }, [publicKey, projectCode]);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md max-w-sm mx-auto">
      <div className="mb-4 text-center">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-2">
          <LucideQrCode className="w-6 h-6" />
          Join Project
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
          Scan this QR code from another device to admit them into the project.
        </p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-inner border border-gray-100 flex items-center justify-center min-h-[256px] min-w-[256px]">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Project QR Code" className="w-64 h-64" />
        ) : (
          <div className="animate-pulse flex items-center justify-center w-64 h-64 bg-gray-100 text-gray-400">
            Generating...
          </div>
        )}
      </div>

      <div className="mt-6 w-full space-y-3">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded text-sm text-blue-800 dark:text-blue-200">
          <strong>Project Code:</strong> <span className="font-mono">{projectCode}</span>
        </div>
        <p className="text-xs text-gray-500 text-center">
          For security, a PIN verification will be required after scanning.
        </p>
      </div>
    </div>
  );
};
