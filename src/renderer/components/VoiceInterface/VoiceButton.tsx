import React from 'react';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';

interface VoiceButtonProps {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function VoiceButton({ onTranscript, onError, className = '' }: VoiceButtonProps) {
  const {
    isRecording,
    isProcessing,
    transcript,
    error,
    volume,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecording();

  // Notify parent component of transcript
  React.useEffect(() => {
    if (transcript && onTranscript) {
      onTranscript(transcript);
    }
  }, [transcript, onTranscript]);

  // Notify parent component of errors
  React.useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  const handleClick = async () => {
    if (isRecording) {
      try {
        await stopRecording();
      } catch (err) {
        console.error('Error stopping recording:', err);
      }
    } else if (!isProcessing) {
      try {
        await startRecording();
      } catch (err) {
        console.error('Error starting recording:', err);
      }
    }
  };

  // Calculate visual indicator based on volume
  const getVolumeScale = () => {
    if (!isRecording) return 1;
    return 1 + volume * 0.3; // Scale between 1.0 and 1.3
  };

  const getButtonColor = () => {
    if (isProcessing) return 'bg-yellow-500 hover:bg-yellow-600';
    if (isRecording) return 'bg-red-500 hover:bg-red-600 animate-pulse';
    return 'bg-blue-500 hover:bg-blue-600';
  };

  const getButtonText = () => {
    if (isProcessing) return 'Processing...';
    if (isRecording) return 'Stop';
    return 'Record';
  };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        onClick={handleClick}
        disabled={isProcessing}
        className={`
          relative
          w-16 h-16
          rounded-full
          ${getButtonColor()}
          text-white
          shadow-lg
          transition-all
          duration-200
          disabled:opacity-50
          disabled:cursor-not-allowed
          flex items-center justify-center
          focus:outline-none focus:ring-4 focus:ring-blue-300
        `}
        style={{
          transform: `scale(${getVolumeScale()})`,
        }}
        title={getButtonText()}
      >
        {isProcessing ? (
          <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
        ) : isRecording ? (
          <svg
            className="w-8 h-8"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <rect x="6" y="6" width="8" height="8" rx="1" />
          </svg>
        ) : (
          <svg
            className="w-8 h-8"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
              clipRule="evenodd"
            />
          </svg>
        )}

        {/* Volume indicator rings */}
        {isRecording && volume > 0.3 && (
          <>
            <div
              className="absolute inset-0 rounded-full border-2 border-white opacity-50"
              style={{
                transform: `scale(${1 + volume * 0.5})`,
                transition: 'transform 0.1s ease-out',
              }}
            />
            {volume > 0.6 && (
              <div
                className="absolute inset-0 rounded-full border-2 border-white opacity-30"
                style={{
                  transform: `scale(${1 + volume * 0.7})`,
                  transition: 'transform 0.1s ease-out',
                }}
              />
            )}
          </>
        )}
      </button>

      {/* Status text */}
      <span className="text-sm text-gray-600 min-h-[20px]">
        {isProcessing && 'Transcribing...'}
        {isRecording && !isProcessing && 'Recording...'}
        {!isRecording && !isProcessing && 'Click to record'}
      </span>

      {/* Volume bar */}
      {isRecording && (
        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-100"
            style={{ width: `${volume * 100}%` }}
          />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="text-xs text-red-500 max-w-xs text-center">
          {error}
        </div>
      )}

      {/* Cancel button when recording */}
      {isRecording && (
        <button
          onClick={cancelRecording}
          className="text-xs text-gray-500 hover:text-red-500 underline"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
