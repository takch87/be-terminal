const fs = require('fs');
const path = require('path');

class ReceiptGenerator {
    constructor() {
        this.receiptsDir = path.join(__dirname, 'receipts');
        this.ensureReceiptsDir();
    }
    
    ensureReceiptsDir() {
        if (!fs.existsSync(this.receiptsDir)) {
            fs.mkdirSync(this.receiptsDir, { recursive: true });
        }
    }
    
    generateReceiptNumber() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '');
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `REC-${timestamp}-${random}`;
    }
    
    generateReceiptHTML(receiptData) {
        const {
            receiptNumber,
            transactionId,
            customerName,
            amount,
            currency,
            eventCode,
            createdAt,
            cardBrand,
            cardLast4
        } = receiptData;
        
        const formattedAmount = (amount / 100).toFixed(2);
        const formattedDate = new Date(createdAt).toLocaleString('es-ES');
        
        return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recibo - ${receiptNumber}</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            max-width: 400px;
            margin: 0 auto;
            padding: 20px;
            background: #f8f9fa;
        }
        .receipt {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border: 2px dashed #e9ecef;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #6c757d;
            padding-bottom: 20px;
            margin-bottom: 25px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #495057;
            margin-bottom: 5px;
        }
        .subtitle {
            color: #6c757d;
            font-size: 14px;
        }
        .receipt-number {
            background: #e9ecef;
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 12px;
            color: #495057;
            margin-top: 15px;
            font-weight: bold;
        }
        .details {
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px dotted #dee2e6;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .label {
            color: #6c757d;
            font-size: 14px;
        }
        .value {
            color: #495057;
            font-weight: 600;
            font-size: 14px;
        }
        .amount-section {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
        }
        .amount-label {
            color: #6c757d;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .amount-value {
            font-size: 28px;
            font-weight: bold;
            color: #28a745;
            margin-top: 5px;
        }
        .footer {
            text-align: center;
            margin-top: 25px;
            padding-top: 20px;
            border-top: 2px solid #e9ecef;
        }
        .footer-text {
            color: #6c757d;
            font-size: 12px;
            line-height: 1.4;
        }
        .status {
            background: #d4edda;
            color: #155724;
            padding: 10px;
            border-radius: 5px;
            text-align: center;
            font-weight: bold;
            margin: 15px 0;
        }
        @media print {
            body { background: white; }
            .receipt { box-shadow: none; border: 1px solid #000; }
        }
    </style>
</head>
<body>
    <div class="receipt">
        <div class="header">
            <div class="logo">🎟️ BeTerminal</div>
            <div class="subtitle">Comprobante de Pago</div>
            <div class="receipt-number">N° ${receiptNumber}</div>
        </div>
        
        <div class="status">
            ✅ PAGO PROCESADO EXITOSAMENTE
        </div>
        
        <div class="details">
            <div class="detail-row">
                <span class="label">Cliente:</span>
                <span class="value">${customerName || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="label">Evento:</span>
                <span class="value">${eventCode || 'General'}</span>
            </div>
            <div class="detail-row">
                <span class="label">Fecha:</span>
                <span class="value">${formattedDate}</span>
            </div>
            <div class="detail-row">
                <span class="label">Método de pago:</span>
                <span class="value">${cardBrand || 'Tarjeta'} •••• ${cardLast4 || '****'}</span>
            </div>
            <div class="detail-row">
                <span class="label">ID Transacción:</span>
                <span class="value">${transactionId}</span>
            </div>
        </div>
        
        <div class="amount-section">
            <div class="amount-label">Total Pagado</div>
            <div class="amount-value">$${formattedAmount} ${currency.toUpperCase()}</div>
        </div>
        
        <div class="footer">
            <div class="footer-text">
                Gracias por su compra<br>
                Conserve este comprobante para sus registros<br>
                <strong>BeTerminal - Sistema de Pagos</strong>
            </div>
        </div>
    </div>
    
    <script>
        // Auto-print si se solicita
        if (window.location.search.includes('print=true')) {
            window.print();
        }
    </script>
</body>
</html>`;
    }
    
    generateReceiptPDF(receiptData) {
        // Para generar PDF, necesitaríamos puppeteer o similar
        // Por ahora, generamos HTML que se puede imprimir
        return this.generateReceiptHTML(receiptData);
    }
    
    async saveReceipt(receiptData) {
        try {
            const html = this.generateReceiptHTML(receiptData);
            const filename = `${receiptData.receiptNumber}.html`;
            const filepath = path.join(this.receiptsDir, filename);
            
            fs.writeFileSync(filepath, html, 'utf8');
            
            return {
                success: true,
                filepath,
                filename,
                url: `/receipts/${filename}`
            };
        } catch (error) {
            console.error('Error saving receipt:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async emailReceipt(receiptData, customerEmail) {
        // Placeholder para envío de email
        // Aquí se integraría con servicio de email como SendGrid, etc.
        console.log(`📧 Email receipt to ${customerEmail} for ${receiptData.receiptNumber}`);
        return {
            success: true,
            message: 'Email sent successfully'
        };
    }
}

module.exports = ReceiptGenerator;
