import React from 'react';
import { NextPage } from 'next';
import Head from 'next/head';

const DownloadPage: NextPage = () => {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = '/downloads/betTerminal-client.sh';
    link.download = 'betTerminal-client.sh';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Head>
        <title>BeTerminal - Descargar Cliente SSH</title>
        <meta name="description" content="Descarga el cliente SSH para conectarte a BeTerminal" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-4">
              🔐 BeTerminal SSH Client
            </h1>
            <p className="text-xl text-blue-200">
              Descarga el cliente para conectarte de forma segura
            </p>
          </div>

          {/* Main Content */}
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/20">
              
              {/* Download Section */}
              <div className="text-center mb-8">
                <div className="bg-green-500/20 rounded-xl p-6 mb-6">
                  <h2 className="text-2xl font-bold text-white mb-4">
                    📥 Descarga el Cliente SSH
                  </h2>
                  <p className="text-green-200 mb-6">
                    Este script te permitirá conectarte a tu servidor BeTerminal de forma segura,
                    incluso si cambias de IP. Solo necesitas configurarlo una vez.
                  </p>
                  
                  <button
                    onClick={handleDownload}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
                  >
                    📁 Descargar betTerminal-client.sh
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-blue-500/20 rounded-xl p-6">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                    🚀 Configuración Rápida
                  </h3>
                  <div className="space-y-3 text-blue-200">
                    <div className="flex items-start space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</span>
                      <span>Descarga el archivo</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">2</span>
                      <span>Ejecuta: <code className="bg-black/30 px-1 rounded">chmod +x betTerminal-client.sh</code></span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</span>
                      <span>Ejecuta: <code className="bg-black/30 px-1 rounded">./betTerminal-client.sh setup</code></span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">4</span>
                      <span>Sigue las instrucciones para copiar la clave SSH</span>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-500/20 rounded-xl p-6">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                    ⚡ Comandos Disponibles
                  </h3>
                  <div className="space-y-2 text-purple-200 font-mono text-sm">
                    <div><span className="text-green-400">setup</span> - Configurar por primera vez</div>
                    <div><span className="text-green-400">connect</span> - Conectarse al servidor</div>
                    <div><span className="text-green-400">test</span> - Probar conexión</div>
                    <div><span className="text-green-400">status</span> - Ver estado actual</div>
                    <div><span className="text-green-400">update-ip</span> - Cambiar IP del servidor</div>
                    <div><span className="text-green-400">help</span> - Ver ayuda completa</div>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="mt-8 grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl mb-2">🔑</div>
                  <h4 className="text-white font-bold mb-2">SSH Seguro</h4>
                  <p className="text-gray-300 text-sm">
                    Genera claves SSH únicas para tu PC
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl mb-2">🌐</div>
                  <h4 className="text-white font-bold mb-2">IP Dinámica</h4>
                  <p className="text-gray-300 text-sm">
                    Funciona aunque cambies de IP
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl mb-2">🔄</div>
                  <h4 className="text-white font-bold mb-2">Fácil Gestión</h4>
                  <p className="text-gray-300 text-sm">
                    Comandos simples para todo
                  </p>
                </div>
              </div>

              {/* Server Info */}
              <div className="mt-8 bg-yellow-500/20 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  🖥️ Información del Servidor
                </h3>
                <div className="grid md:grid-cols-2 gap-4 text-yellow-200">
                  <div>
                    <strong>IP del Servidor:</strong> 184.105.7.184
                  </div>
                  <div>
                    <strong>Usuario SSH:</strong> root
                  </div>
                  <div>
                    <strong>Puerto SSH:</strong> 22
                  </div>
                  <div>
                    <strong>Método de Auth:</strong> Solo SSH Keys
                  </div>
                </div>
              </div>

              {/* Troubleshooting */}
              <div className="mt-8 bg-red-500/20 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  🆘 ¿Problemas?
                </h3>
                <div className="text-red-200 space-y-2">
                  <p>• Si no puedes conectarte, verifica que copiaste la clave SSH al servidor</p>
                  <p>• Si cambió la IP del servidor, ejecuta: <code className="bg-black/30 px-1 rounded">./betTerminal-client.sh update-ip</code></p>
                  <p>• Para probar la conexión: <code className="bg-black/30 px-1 rounded">./betTerminal-client.sh test</code></p>
                  <p>• Para ver el estado: <code className="bg-black/30 px-1 rounded">./betTerminal-client.sh status</code></p>
                </div>
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-12 text-blue-200">
            <p>© 2025 BeTerminal - Conexión SSH Segura</p>
            <p className="text-sm mt-2">
              <a href="/" className="hover:text-white transition-colors">← Volver al Dashboard</a>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        code {
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }
      `}</style>
    </>
  );
};

export default DownloadPage;
