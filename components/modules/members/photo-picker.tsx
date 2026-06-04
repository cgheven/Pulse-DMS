"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Upload, Loader2, X, SwitchCamera, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { optimizeImage } from "@/lib/image";
import { uploadMemberPhoto, deleteMemberPhoto } from "@/app/actions/members";

interface PhotoPickerProps {
  value: string | null;
  onChange: (url: string | null) => void;
  fallbackText?: string;
  disabled?: boolean;
}

export function PhotoPicker({ value, onChange, fallbackText, disabled }: PhotoPickerProps) {
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (fallbackText ?? "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  // Optimize → upload → propagate URL. Best-effort delete of the old photo.
  const handleBlob = useCallback(
    async (raw: Blob) => {
      setBusy(true);
      const previous = value;
      try {
        const optimized = await optimizeImage(raw);
        const fd = new FormData();
        fd.append("file", new File([optimized], "photo.webp", { type: "image/webp" }));
        const res = await uploadMemberPhoto(fd);
        if ("error" in res) {
          toast({ title: "Upload failed", description: res.error, variant: "destructive" });
          return;
        }
        onChange(res.url);
        if (previous && previous.includes("/member-photos/")) {
          void deleteMemberPhoto(previous);
        }
      } catch (err) {
        toast({ title: "Could not process image", description: (err as Error).message, variant: "destructive" });
      } finally {
        setBusy(false);
      }
    },
    [value, onChange],
  );

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (file) void handleBlob(file);
  }

  function handleRemove() {
    const previous = value;
    onChange(null);
    if (previous && previous.includes("/member-photos/")) {
      void deleteMemberPhoto(previous);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar */}
      <div className="relative">
        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-sidebar-border bg-primary/10 flex items-center justify-center">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Member photo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-primary">{initials}</span>
          )}
          {busy && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>
        {value && !busy && !disabled && (
          <button
            type="button"
            onClick={handleRemove}
            title="Remove photo"
            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow hover:bg-rose-600 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5"
          disabled={disabled || busy} onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" /> Upload
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5"
          disabled={disabled || busy} onClick={() => setCameraOpen(true)}>
          <Camera className="w-3.5 h-3.5" /> Camera
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileSelected}
      />

      {cameraOpen && (
        <CameraCapture
          onCapture={(blob) => { setCameraOpen(false); void handleBlob(blob); }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

// ── Live camera capture (getUserMedia) ──────────────────────────────────────
// Works with laptop webcams, external USB cameras, and phone front/back
// cameras. Live preview + capture; facing-mode toggle for multi-camera devices.
function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function friendlyError(err: unknown): string {
      const name = (err as { name?: string })?.name ?? "";
      switch (name) {
        case "NotAllowedError":
        case "SecurityError":
          return "Camera permission blocked. Allow camera access for this site, then try again.";
        case "NotFoundError":
        case "DevicesNotFoundError":
          return "No camera found on this device. Use Upload instead.";
        case "NotReadableError":
        case "TrackStartError":
          return "Camera is in use by another app (Zoom, FaceTime, etc.). Close it and try again.";
        case "OverconstrainedError":
          return "This camera doesn't support the requested settings.";
        default:
          return "Could not access camera. Use Upload instead.";
      }
    }

    async function start() {
      setReady(false);
      setError(null);

      // Secure-context / API availability guard. localhost is a secure
      // context even over HTTP; a raw LAN IP over HTTP is not.
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled)
          setError("Camera needs a secure connection (https or localhost). Use Upload instead.");
        return;
      }

      // Try the preferred (square-ish, front) constraints, then fall back to
      // a bare { video: true } request, which is the most widely supported.
      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false },
        { video: { facingMode: facing }, audio: false },
        { video: true, audio: false },
      ];

      let lastErr: unknown = null;
      for (const constraints of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
          }
          setReady(true);
          return;
        } catch (err) {
          lastErr = err;
          // Permission/in-use/no-device errors won't be fixed by relaxing
          // constraints — stop retrying.
          const name = (err as { name?: string })?.name ?? "";
          if (["NotAllowedError", "SecurityError", "NotFoundError", "NotReadableError"].includes(name)) break;
        }
      }
      if (!cancelled) {
        console.error("[camera]", lastErr);
        setError(friendlyError(lastErr));
      }
    }
    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) onCapture(blob); }, "image/webp", 0.9);
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogTitle className="sr-only">Take Photo</DialogTitle>
        <div className="bg-black aspect-square relative flex items-center justify-center">
          {error ? (
            <p className="text-sm text-white/80 px-6 text-center">{error}</p>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
              />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              )}
              {/* Square framing guide */}
              <div className="absolute inset-6 rounded-full border-2 border-white/30 pointer-events-none" />
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 px-5 py-4 bg-card border-t border-sidebar-border">
          <Button type="button" variant="outline" size="icon"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            title="Switch camera" disabled={!!error}>
            <SwitchCamera className="w-4 h-4" />
          </Button>
          <Button type="button" className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={capture} disabled={!ready || !!error}>
            <Camera className="w-4 h-4" /> Capture
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
