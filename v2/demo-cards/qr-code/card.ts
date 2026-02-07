import { defineCard } from '@hashdo/core';

/**
 * QR Code card — generates a QR code image from any text or URL.
 * Uses the public goqr.me API (no API key needed).
 */
export default defineCard({
  name: 'qr-code',
  description: 'Generate a QR code image from text or a URL. Returns an embeddable QR code.',
  icon: './icon.svg',

  inputs: {
    content: {
      type: 'string',
      required: true,
      description: 'The text or URL to encode in the QR code',
    },
    size: {
      type: 'number',
      required: false,
      default: 300,
      description: 'Size of the QR code in pixels (width and height)',
    },
    label: {
      type: 'string',
      required: false,
      description: 'Optional label to display below the QR code',
    },
  },

  async getData({ inputs, state }) {
    const size = inputs.size || 300;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(inputs.content)}`;

    const scanCount = ((state.scanCount as number) || 0) + 1;

    return {
      viewModel: {
        qrUrl,
        content: inputs.content,
        size,
        label: inputs.label || inputs.content,
        scanCount,
      },
      state: {
        scanCount,
        lastGenerated: new Date().toISOString(),
      },
    };
  },

  actions: {
    resize: {
      label: 'Resize QR Code',
      description: 'Change the size of the QR code',
      inputs: {
        newSize: {
          type: 'number',
          required: true,
          description: 'New size in pixels',
        },
      },
      async handler({ actionInputs, state }) {
        return {
          state: { ...state, preferredSize: actionInputs.newSize },
          message: `QR code will now render at ${actionInputs.newSize}px`,
        };
      },
    },
  },

  template: ({ qrUrl, content, label, size }) => `
    <div style="text-align:center; padding:16px; font-family:system-ui,sans-serif;">
      <img src="${qrUrl}" alt="QR Code" width="${size}" height="${size}"
           style="border-radius:8px; border:1px solid #e0e0e0;" />
      <p style="margin-top:12px; color:#555; font-size:14px;">
        ${label}
      </p>
    </div>
  `,
});
