import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { LucideCamera, LucideXCircle } from 'lucide-react';

interface QRScannerProps {
  onScanSuccess: (publicKey: Uint8Array, projectCode: string) => void;
  onCancel: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onCancel }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("qr-reader");
    scannerRef.current = html5QrCode;

    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        try {
          const url = new URL(decodedText);
          if (url.protocol !== 'stratigraph:' || !url.pathname.includes('peer/v3')) {
            throw new Error("Invalid StratiGraph QR format");
          }
          const pkBase64 = url.searchParams.get('pk');
          const projectCode = url.searchParams.get('proj');
          if (!pkBase64 || !projectCode) throw new Error("Missing payload data");

          // Convert base64 back to Uint8Array
          const binaryString = atob(decodeURIComponent(pkBase64));
          const publicKey = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            publicKey[i] = binaryString.charCodeAt(i);
          }
          
          html5QrCode.stop().then(() => onScanSuccess(publicKey, projectCode));
        } catch (err) {
          console.error("QR Parse Error", err);
          setError("Invalid QR code. Please scan a valid StratiGraph v3 Project QR.");
        }
      },
      () => {
        // Ignored. html5-qrcode fires this constantly while looking for a code.
      }
    ).catch(err => {
      console.error("Failed to start scanner", err);
      setError("Failed to start camera. Please check permissions.");
    });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md max-w-sm mx-auto">
      <div className="mb-4 text-center w-full flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <LucideCamera className="w-6 h-6" />
          Scan QR Code
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <LucideXCircle className="w-6 h-6" />
        </button>
      </div>

      {error && (
        <div className="mb-4 w-full bg-red-50 dark:bg-red-900/30 p-3 rounded text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="w-full relative rounded overflow-hidden">
        <div id="qr-reader" className="w-full" style={{ minHeight: '300px' }}></div>
      </div>
    </div>
  );
};
