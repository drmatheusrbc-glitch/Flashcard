import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  output: 'standalone',
  // PDF.js e @napi-rs/canvas precisam ser carregados no runtime Node.
  // Externalizar evita que o Webpack tente interpretar o binário nativo .node como JavaScript.
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  // Inclui o worker ESM do PDF.js no pacote serverless da Vercel.
  outputFileTracingIncludes: {
    '/*': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
