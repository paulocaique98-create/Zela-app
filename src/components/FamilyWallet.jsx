import React from 'react';
import { QrCode, GraduationCap, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// Quebra um texto em várias linhas para caber em maxWidth, usando o ctx já com a
// fonte configurada. Evita que nomes longos (3+ filhos) sejam cortados na imagem.
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export default function FamilyWallet({ familyStudents, currentUser, currentSchool }) {
  const handleDownload = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const CANVAS_WIDTH = 600;
    const TEXT_MAX_WIDTH = 520;
    const NAME_LINE_HEIGHT = 40;

    // Mede as linhas do nome ANTES de fixar o tamanho do canvas (measureText não
    // depende das dimensões do canvas, só da fonte configurada no contexto).
    ctx.font = "bold 32px sans-serif";
    const studentsText = familyStudents.map(s => s.name).join(' & ');
    const nameLines = wrapText(ctx, studentsText, TEXT_MAX_WIDTH);

    const BASE_HEIGHT = 700;
    const extraHeight = Math.max(0, nameLines.length - 1) * NAME_LINE_HEIGHT;
    canvas.width = CANVAS_WIDTH;
    canvas.height = BASE_HEIGHT + extraHeight;

    // Fundo branco
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nome(s) do(s) aluno(s), em uma ou mais linhas
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    const nameStartY = 70;
    nameLines.forEach((line, i) => {
      ctx.fillText(line, CANVAS_WIDTH / 2, nameStartY + i * NAME_LINE_HEIGHT);
    });

    const respY = nameStartY + nameLines.length * NAME_LINE_HEIGHT + 10;
    ctx.fillStyle = "#64748b";
    ctx.font = "24px sans-serif";
    ctx.fillText("Resp: " + (currentUser?.name || 'Responsável'), CANVAS_WIDTH / 2, respY);

    // Texto inferior
    ctx.fillStyle = "#475569";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("Autorização Zela - QR Code", CANVAS_WIDTH / 2, canvas.height - 70);

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      // QR Code no centro, logo abaixo do bloco de texto
      const qrY = respY + 40;
      ctx.drawImage(img, 100, qrY, 400, 400);

      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `QRCode_${currentUser?.name?.split(' ')[0] || 'Zela'}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
            <QrCode size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">QR Code</h2>
            <p className="text-slate-500 text-sm hidden sm:block">Apresente este código na câmera do totem para realizar o check-in ou check-out.</p>
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-xl font-bold transition-all active:scale-95 text-sm"
        >
          <Download size={18} />
          <span className="hidden sm:inline">Baixar Imagem</span>
        </button>
      </div>

      <p className="text-slate-500 text-sm sm:hidden mb-4 text-center">Apresente este código na câmera do totem para realizar o check-in ou check-out.</p>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1 flex items-center justify-center">
        {!currentUser?.id || !currentSchool?.id ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 w-full max-w-sm">
            <p className="text-slate-500 font-medium">Carregando dados da conta...</p>
          </div>
        ) : familyStudents.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 w-full max-w-sm">
            <p className="text-slate-500 font-medium">Nenhum aluno vinculado a esta conta.</p>
          </div>
        ) : (
          <div className="w-full max-w-md">
            <div className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-200 flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
              
              <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mb-3 mt-2">
                <GraduationCap size={28} className="text-indigo-600" />
              </div>
              
              <h3 className="text-2xl sm:text-3xl font-black text-slate-800 mb-1 leading-tight">
                {familyStudents.map(s => s.name).join(' & ')}
              </h3>
              <p className="text-sm sm:text-base font-medium text-slate-500 mb-6">
                Resp: {currentUser?.name || 'Responsável'}
              </p>
              
              <div className="bg-white p-4 sm:p-5 rounded-3xl border-2 border-slate-100 shadow-sm flex items-center justify-center mb-2">
                <QRCodeSVG 
                  id="qr-code-svg"
                  value={JSON.stringify({ type: 'zela_checkin', family_id: currentUser?.id, school_id: currentSchool?.id })} 
                  size={280} 
                  level="M" 
                  includeMargin={false}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
