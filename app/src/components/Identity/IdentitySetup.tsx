import React, { useState } from 'react';
import { generateIdentity, exportEncryptedBackup } from '../../security/crypto';
import { storeIdentity } from '../../security/keychain';
import { saveFileDialog } from '../../utils/tauriBridge';
import { LucideShieldCheck, LucideDownload, LucideAlertTriangle } from 'lucide-react';

interface IdentitySetupProps {
  onComplete: () => void;
}

export const IdentitySetup: React.FC<IdentitySetupProps> = ({ onComplete }) => {
  const [step, setStep] = useState<'intro' | 'generate' | 'backup' | 'bypass_warning' | 'done'>('intro');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [bypassText, setBypassText] = useState('');
  const [keypair, setKeypair] = useState<{ publicKey: Uint8Array, privateKey: Uint8Array } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleGenerate = () => {
    if (pin.length < 6) {
      setError("Passphrase must be at least 6 characters.");
      return;
    }
    if (pin !== confirmPin) {
      setError("Passphrases do not match.");
      return;
    }
    setError(null);
    const keys = generateIdentity();
    setKeypair(keys);
    setStep('backup');
  };

  const handleExportBackup = async () => {
    if (!keypair) return;
    setIsExporting(true);
    try {
      const encryptedBackup = await exportEncryptedBackup(keypair.privateKey, pin);
      const success = await saveFileDialog(encryptedBackup, {
        defaultName: 'stratigraph-identity-backup.aes',
        filters: [{ name: 'Encrypted Backup', extensions: ['aes'] }],
        asBinary: true
      });
      if (success) {
        // Now store identity in keychain and finish
        await storeIdentity(keypair.privateKey, keypair.publicKey, pin);
        setStep('done');
      }
    } catch (e) {
      console.error(e);
      setError("Failed to export backup.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleBypassConfirm = async () => {
    if (bypassText !== 'I UNDERSTAND THE RISK') {
      setError("Please type the exact confirmation phrase.");
      return;
    }
    if (!keypair) return;
    try {
      await storeIdentity(keypair.privateKey, keypair.publicKey, pin);
      setStep('done');
    } catch (e) {
      console.error(e);
      setError("Failed to store identity.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl max-w-lg w-full">
        
        {step === 'intro' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400">
              <LucideShieldCheck className="w-8 h-8" />
              <h2 className="text-2xl font-bold">Secure Identity Setup</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-300">
              StratiGraph uses Zero-Trust Identity. This device will generate a unique cryptographic signature used to legally sign all your stratigraphic edits.
            </p>
            <p className="text-gray-600 dark:text-gray-300">
              You will need to create a secure passphrase to protect your identity.
            </p>
            <button 
              onClick={() => setStep('generate')}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded"
            >
              Begin Setup
            </button>
          </div>
        )}

        {step === 'generate' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create Passphrase</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This passphrase unlocks your identity on this device and protects your backup. Do not forget it.
            </p>
            <input 
              type="password" 
              placeholder="Enter Passphrase (min 6 chars)" 
              className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600"
              value={pin} onChange={(e) => setPin(e.target.value)} 
            />
            <input 
              type="password" 
              placeholder="Confirm Passphrase" 
              className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600"
              value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} 
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button 
              onClick={handleGenerate}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded"
            >
              Generate Identity
            </button>
          </div>
        )}

        {step === 'backup' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mandatory Backup</h2>
            <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-semibold mb-1">Store Offline in Site Archive</p>
              <p>
                Save this AES-256 encrypted backup to a <strong>removable USB drive</strong>. Do not use cloud storage. If this device is lost, this file is the ONLY way to recover your cryptographic identity and maintain unbroken chain-of-custody for the site audit.
              </p>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            
            <button 
              onClick={handleExportBackup}
              disabled={isExporting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded flex items-center justify-center gap-2"
            >
              <LucideDownload className="w-5 h-5" />
              {isExporting ? 'Exporting...' : 'Export Encrypted Backup'}
            </button>

            <button 
              onClick={() => setStep('bypass_warning')}
              className="w-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm underline mt-2"
            >
              I cannot export a backup right now (Not Recommended)
            </button>
          </div>
        )}

        {step === 'bypass_warning' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <LucideAlertTriangle className="w-6 h-6" />
              <h2 className="text-xl font-bold">Acknowledge Risk</h2>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              If you lose this device without a backup, your identity will be permanently lost. Every loss event produces an identity discontinuity in the signed operation log that must be formally defended in heritage compliance reviews.
            </p>
            <p className="text-sm font-semibold">
              Type 'I UNDERSTAND THE RISK' to proceed without a backup.
            </p>
            <input 
              type="text" 
              className="w-full border p-2 rounded uppercase dark:bg-gray-700 dark:border-gray-600"
              value={bypassText} onChange={(e) => setBypassText(e.target.value)} 
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            
            <div className="flex gap-2">
              <button 
                onClick={() => setStep('backup')}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 rounded"
              >
                Go Back
              </button>
              <button 
                onClick={handleBypassConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded"
              >
                Accept Risk
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 text-center py-6">
            <div className="flex justify-center text-green-500 mb-4">
              <LucideShieldCheck className="w-16 h-16" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Setup Complete</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Your device identity is secured and ready for fieldwork.
            </p>
            <button 
              onClick={onComplete}
              className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded"
            >
              Continue to StratiGraph
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
