import React, { useRef, useState } from 'react';
import type { TranslationKeys } from '../translations';
import { Upload, FileText, Image as ImageIcon, Camera, Download, Share2, Printer, ArrowRight, X, Play } from 'lucide-react';
import { callAI, nvidiaOCR, postLog, loadPdfJS, chunkText, getEmbeddingsForChunks, checkIsMedicalDocument } from '../utils/aiService';
import type { AIProvider } from '../utils/aiService';
import { saveChunks } from '../utils/db';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import { App as CapacitorApp } from '@capacitor/app';

interface Report {
  id: string;
  fileName: string;
  description: string;
  timestamp: string;
  language: 'en' | 'mr';
}

interface ReportAnalyzerProps {
  t: TranslationKeys;
  language: 'en' | 'mr';
  onAnalysisComplete: (reportData: { id: string; fileName: string; description: string }) => void;
  recentReports: Report[];
  onSelectReport: (report: Report) => void;
  activeReport: { id?: string; fileName: string; description: string } | null;
  onNavigateToChat: () => void;
  userMemory: string[];
  provider: AIProvider;
  model: string;
  username: string;
  onLoadingStateChange?: (loading: boolean) => void;
}

export const ReportAnalyzer: React.FC<ReportAnalyzerProps> = ({
  t,
  language,
  onAnalysisComplete,
  recentReports,
  onSelectReport,
  activeReport,
  onNavigateToChat,
  userMemory,
  provider,
  model,
  username,
  onLoadingStateChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<'extracting' | 'ocr' | 'analyzing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loadingMessage, setLoadingMessage] = useState<string>('Prepping documents...');
  const [currentController, setCurrentController] = useState<AbortController | null>(null);

  // CDAC loading message alternator
  React.useEffect(() => {
    if (!loading) return;
    const cdacMessages = [
      "We are working on it at CDAC high-performance cluster...",
      "Allocating secure GPU nodes for NVIDIA Maverick OCR...",
      "CDAC node 12 is segmenting report sections...",
      "Running diagnostics on CDAC secure healthcare server...",
      "Structuring test parameters at CDAC data center...",
      "Applying medical vocabulary mapping on CDAC supercomputer...",
      "CDAC cognitive agent analyzing blood chemistry metrics...",
      "Refining translation accuracy for local dialects..."
    ];
    let index = 0;
    const interval = setInterval(() => {
      if (loadingStep === 'analyzing') {
        setLoadingMessage(cdacMessages[index % cdacMessages.length]);
        index++;
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [loading, loadingStep]);

  // Synchronize loading state and block hardware back button during report generation
  React.useEffect(() => {
    onLoadingStateChange?.(loading);
    if (loading && Capacitor.isNativePlatform()) {
      const listenerPromise = CapacitorApp.addListener('backButton', () => {
        console.log('Hardware back button blocked during analysis');
      });
      return () => {
        listenerPromise.then(h => h.remove());
      };
    }
  }, [loading, onLoadingStateChange]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = error => reject(error);
    });
  };

  const analyzeQueue = async (files: File[]) => {
    if (files.length === 0) return;
    
    const targetFileName = files.map(f => f.name).join(' + ');
    const existingReport = recentReports.find(r => r.fileName === targetFileName);
    if (existingReport) {
      await postLog('info', `Duplicate report detected: "${targetFileName}". Loading cached analysis.`);
      setLoading(true);
      setLoadingStep('analyzing');
      setLoadingMessage('Loading cached report explanation...');
      setTimeout(() => {
        setLoading(false);
        setLoadingStep(null);
        setSelectedFiles([]);
        onAnalysisComplete({
          id: existingReport.id,
          fileName: existingReport.fileName,
          description: existingReport.description,
        });
      }, 800);
      return;
    }

    await postLog('info', `Starting analysis queue of ${files.length} files...`);
    setLoading(true);
    setLoadingStep('extracting');
    setError(null);
    setLoadingMessage('Initializing CDAC compute nodes...');

    const controller = new AbortController();
    setCurrentController(controller);

    const reportId = `report_${Date.now()}`;
    let combinedText = '';

    try {
      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        const cleanName = file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name;
        
        if (controller.signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }

        await postLog('info', `Processing file ${idx + 1}/${files.length}: ${file.name}`);
        setLoadingMessage(`CDAC cluster reading ${cleanName} (${idx + 1}/${files.length})...`);

        if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
          await postLog('error', `Unsupported file type: ${file.type}`);
          throw new Error(`Unsupported file format for ${file.name}. Please upload PDF or Image.`);
        }

        if (file.type.startsWith('image/')) {
          const base64DataUrl = await fileToBase64(file);
          setLoadingMessage(`CDAC Node running NVIDIA Maverick OCR on ${cleanName}...`);
          const text = await nvidiaOCR(base64DataUrl, controller.signal);
          combinedText += `[File: ${file.name}]\n${text}\n\n`;
        } else {
          const arrayBuffer = await fileToArrayBuffer(file);
          setLoadingMessage(`CDAC extracting metadata from ${cleanName}...`);
          const pdfjs = await loadPdfJS();
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          
          let pdfText = '';
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            if (controller.signal.aborted) {
              throw new DOMException('Aborted by user', 'AbortError');
            }
            setLoadingMessage(`CDAC extracting ${cleanName} - Page ${pageNum}/${pdf.numPages}...`);
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            pdfText += `[Page ${pageNum}]\n${pageText}\n\n`;
          }
          combinedText += `[File: ${file.name}]\n${pdfText}\n\n`;
        }
      }

      if (controller.signal.aborted) {
        throw new DOMException('Aborted by user', 'AbortError');
      }

      if (!combinedText.trim()) {
        throw new Error("No readable text could be extracted from the uploaded files.");
      }

      setLoadingMessage('CDAC chunking extracted text...');
      const chunks = chunkText(combinedText);

      setLoadingMessage('CDAC generating vector embeddings...');
      const embeddings = await getEmbeddingsForChunks(chunks, provider, controller.signal);

      setLoadingMessage('Saving chunks to local secure database...');
      const chunksToSave = chunks.map((text, i) => ({
        text,
        embedding: embeddings[i],
      }));
      await saveChunks(username, reportId, chunksToSave);

      if (controller.signal.aborted) {
        throw new DOMException('Aborted by user', 'AbortError');
      }

      setLoadingStep('analyzing');
      setLoadingMessage('Analyzing report metrics at CDAC compute cluster...');

      const langInstruction = language === 'mr'
        ? `Language & Translation Guidelines:
- You MUST write your explanation primarily in Marathi (Primary language).
- However, keep all key medical terms, test parameters, symptoms, and diagnoses in English (Secondary language) in parentheses or alongside the Marathi description. E.g. "रक्तदाब (Blood Pressure)", "कोलेस्टेरॉल (Cholesterol) ची पातळी वाढलेली (Elevated) आहे", "यकृत (Liver)", "लाल रक्तपेशी (Red Blood Cells)". This is critical so that the patient can read the report comfortably while matching terms to their actual paper report.
- The entire analysis, including sections like Summary, Observations, Table headers, and Actionable Insights must be written in Marathi as the primary language with English in parentheses. Do NOT write the main explanations in English.`
        : `Language & Translation Guidelines:
- You must write your explanation entirely in English. Ensure all medical terminology is clearly explained in simple, patient-friendly terms.`;

      const systemPrompt = `You are a professional Medical Educator and Report Explainer.
Your purpose is to explain medical reports in simple, patient-friendly terms.
You are NOT diagnosing or prescribing; you are educating the patient.

${langInstruction}

Exhaustive Detail Requirement:
Do NOT summarize briefly or write a short 2-3 paragraph summary. Provide a complete, detailed, end-to-end breakdown of each and every section, page, test parameter, result value, and reference range found in the report. 
Under the section "Important Observations & Detailed Parameter Breakdown", you MUST list and explain EACH AND EVERY parameter or test result in the report as a separate item. For each parameter, provide a paragraph of 3-5 sentences explaining:
- What this parameter measures
- The user's exact result and reference range
- What this specific result means for their health (normal, low, high, or critical)
If a report is long (e.g. 17 pages), go section-by-section and page-by-page. Do not omit any parameters or findings.

Patient Personal Memory Background (Known History/Allergies/Conditions):
${userMemory && userMemory.length > 0 ? userMemory.map(m => `- ${m}`).join('\n') : '- No historical health memory recorded.'}

Analyze and explain the report in light of this patient background. If they have allergies, flag if the report findings or standard guidance might conflict or relate to it. If they have specific historical conditions like diabetes, kidney disease, or high blood pressure, pay extra attention to parameters relevant to those conditions.

Format your output using clean Markdown, following this structure:
1. **Summary**: Provide a high-level summary of the report in 2-3 simple sentences.
2. **Key Findings & Values**: NEVER output markdown or HTML tables. Instead, list the key findings and parameters as a clean, structured bulleted list of key-value blocks (e.g. using bold text like '**Parameter Name**: Value (Reference Range: Normal Range) [Status]') so that it fits phone screens naturally without horizontal scrolling.
3. **Important Observations & Detailed Parameter Breakdown**: Exhaustive list explaining every single test parameter, parameter value, and abnormal value in simple, non-frightening terms. Use analogies where helpful.
4. **Actionable Insights & Lifestyle Suggestions**: Suggest general, safe lifestyle recommendations (e.g. hydration, balanced meals, sleep) but DO NOT give specific treatment or drug prescriptions.
5. **Next Steps & Questions for Your Doctor**: Outline 3-4 intelligent questions the user can ask their primary physician.

ALWAYS start and end your explanation with this safety disclaimer:
"Disclaimer: This AI explanation is for educational purposes only and is not a medical diagnosis or treatment plan. Please consult a qualified healthcare professional for medical care."

At the very end of your response, after the safety disclaimer, output a special block formatted as:
[MEMORY_POINTS]
- parameter/condition 1
- parameter/condition 2
- parameter/condition 3
[/MEMORY_POINTS]
Listing at most 3-4 key health flags, parameters, or conditions identified in this report (e.g., "Elevated Cholesterol", "Normal Blood Sugar", "Trace RBC in Urine") in English so they can be saved in the patient's profile.`;

      // 4. Validate via NVIDIA that the document contains medical information
      setLoadingMessage("Validating report format via NVIDIA secure node...");
      const isMedical = await checkIsMedicalDocument(combinedText, controller.signal);
      if (!isMedical) {
        throw new Error("INVALID_DOCUMENT: The uploaded file/photo does not appear to be a medical report or clinical document. Please upload a valid medical report.");
      }

      const userPrompt = `Please explain the medical report based on the following findings:\n\n${combinedText}`;
      const description = await callAI(provider, model, systemPrompt, [{ role: 'user', content: userPrompt }], 0.2, controller.signal);

      await postLog('info', `Report analysis complete for ${files.map(f => f.name).join(', ')}`);
      
      setSelectedFiles([]);
      
      onAnalysisComplete({
        id: reportId,
        fileName: files.map(f => f.name).join(' + '),
        description: description,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Aborted by user') {
        await postLog('warn', 'Analysis aborted by user.');
        setError('Analysis was cancelled.');
      } else {
        console.error(err);
        const rawMsg = err.message || '';
        if (rawMsg.startsWith('INVALID_DOCUMENT:')) {
          setError(rawMsg.replace('INVALID_DOCUMENT: ', ''));
        } else {
          const msgLower = rawMsg.toLowerCase();
          if (msgLower.includes('quota') || msgLower.includes('limit') || msgLower.includes('exceeded') || msgLower.includes('429')) {
            setError('API Quota Limit Exceeded. Please try again later.');
          } else if (msgLower.includes('key') || msgLower.includes('invalid') || msgLower.includes('not valid') || msgLower.includes('400')) {
            setError('Invalid API Key configuration. Please update in settings.');
          } else {
            setError(rawMsg || 'An error occurred during report analysis.');
          }
        }
      }
    } finally {
      setLoading(false);
      setLoadingStep(null);
      setCurrentController(null);
    }
  };

  const handleScanClick = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await CapacitorCamera.checkPermissions();
        if (status.camera !== 'granted') {
          const request = await CapacitorCamera.requestPermissions({ permissions: ['camera'] });
          if (request.camera === 'granted') {
            cameraInputRef.current?.click();
          }
          return;
        }
      } catch (err: any) {
        postLog('error', `Camera permission failed: ${err.message}`);
      }
    }
    cameraInputRef.current?.click();
  };

  const handleUploadClick = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await CapacitorCamera.checkPermissions();
        if (status.photos !== 'granted') {
          const request = await CapacitorCamera.requestPermissions({ permissions: ['photos'] });
          if (request.photos === 'granted') {
            fileInputRef.current?.click();
          }
          return;
        }
      } catch (err: any) {
        postLog('error', `Photos permission failed: ${err.message}`);
      }
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const arr = Array.from(files);
      setSelectedFiles(prev => {
        const uniqueArr = arr.filter(newFile => 
          !prev.some(existing => existing.name === newFile.name && existing.size === newFile.size)
        );
        return [...prev, ...uniqueArr];
      });
      setError(null);
    }
  };

  const downloadSummaryFile = () => {
    if (!activeReport) return;
    const element = document.createElement("a");
    const file = new Blob([activeReport.description], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${activeReport.fileName.split('.')[0]}_explanation.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const printReport = () => {
    window.print();
  };

  const shareReportText = () => {
    if (!activeReport) return;
    const shareText = `Medical Report Analysis Summary for ${activeReport.fileName}:\n\n${activeReport.description.substring(0, 300)}...`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Gemvora AI - Medical Report Summary',
        text: shareText,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(activeReport.description).then(() => {
        alert('Copied explanation to clipboard!');
      });
    }
  };

  const renderFormattedMarkdown = (text: string) => {
    const lines = text.split('\n');
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    const elements = lines.map((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('|')) {
        inTable = true;
        const cols = trimmed.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (trimmed.includes('---')) return null;
        
        if (tableHeaders.length === 0) {
          tableHeaders = cols;
          return null;
        } else {
          tableRows.push(cols);
          return null;
        }
      }

      if (inTable && !trimmed.startsWith('|')) {
        inTable = false;
        const currentHeaders = [...tableHeaders];
        const currentRows = [...tableRows];
        tableHeaders = [];
        tableRows = [];

        return (
          <div key={`table-${idx}`} className="w-full overflow-x-auto my-3 rounded-xl border border-[var(--border-subtle)]">
            <table className="min-w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-surface-variant)] border-b border-[var(--border-subtle)]">
                  {currentHeaders.map((h, i) => (
                    <th key={i} className="p-2 font-bold text-[var(--text-primary)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="p-2 text-[var(--text-secondary)] whitespace-normal leading-normal">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      if (trimmed.startsWith('###')) {
        return (
          <h4 key={idx} className="text-sm font-bold text-[var(--text-primary)] mt-3 mb-1 break-words">
            {trimmed.replace('###', '').trim()}
          </h4>
        );
      }
      if (trimmed.startsWith('##')) {
        return (
          <h3 key={idx} className="text-base font-bold text-[var(--text-primary)] mt-4 mb-2 border-b border-[var(--border-subtle)] pb-1 break-words">
            {trimmed.replace('##', '').trim()}
          </h3>
        );
      }
      if (trimmed.startsWith('1.') || trimmed.startsWith('2.') || trimmed.startsWith('3.') || trimmed.startsWith('4.') || trimmed.startsWith('5.')) {
        const cleanContent = trimmed.substring(2).trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return (
          <div key={idx} className="flex gap-2 text-sm text-[var(--text-secondary)] my-1 leading-relaxed box-border">
            <span className="font-bold text-[var(--accent-primary)] flex-shrink-0">{trimmed.split('.')[0]}.</span>
            <span className="flex-1 min-w-0 break-words" dangerouslySetInnerHTML={{ __html: cleanContent }} />
          </div>
        );
      }
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const cleanContent = trimmed.substring(1).trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return (
          <div key={idx} className="flex gap-2 text-sm text-[var(--text-secondary)] my-1 leading-relaxed ml-2 box-border">
            <span className="text-[var(--accent-primary)] flex-shrink-0">•</span>
            <span className="flex-1 min-w-0 break-words" dangerouslySetInnerHTML={{ __html: cleanContent }} />
          </div>
        );
      }

      const formattedLine = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return trimmed ? (
        <p key={idx} className="text-sm text-[var(--text-secondary)] leading-relaxed my-1 break-words" dangerouslySetInnerHTML={{ __html: formattedLine }} />
      ) : (
        <div key={idx} className="h-1.5" />
      );
    });

    return elements;
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative">
      
      {/* Upload/Analysis Workspace View */}
      {!activeReport && !loading && (
        <div className="flex-1 flex flex-col min-h-0 relative">
          
          {/* Fixed Uploader Top Area */}
          <div className="p-4 space-y-4 flex-shrink-0">
          
          {/* Welcome Header */}
          <div className="py-2 animate-message flex items-center gap-3.5">
            <img 
              src="/logo.png" 
              alt="Gemvora Logo" 
              className="w-12 h-12 rounded-2xl object-contain shadow-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-1.5 flex-shrink-0" 
            />
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                {t.welcomeTitle}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-normal">
                {t.welcomeSubtitle}
              </p>
            </div>
          </div>

          {/* Minimal Uploader Box */}
          <div className="p-6 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-variant)] text-center relative overflow-hidden animate-message">
            <div className="w-10 h-10 rounded-full bg-[var(--accent-glow)] flex items-center justify-center mx-auto mb-3 text-[var(--accent-primary)]">
              <Upload className="w-5 h-5" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Scan or Upload Reports
              </h3>
              <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto leading-normal">
                {t.uploadHint} (Supports PDF, Images)
              </p>

              {/* Action grid (Always visible to allow appending multiple files) */}
              <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto pt-1">
                <button
                  onClick={handleScanClick}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[var(--accent-primary)] hover:opacity-90 font-bold text-xs text-white shadow-sm transition-all active:scale-[0.97]"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>

                <button
                  onClick={handleUploadClick}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-variant)] font-bold text-xs transition-all active:scale-[0.97] text-[var(--text-primary)]"
                >
                  <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>Upload</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Scrollable middle list section for queues and history */}
        <div className="flex-1 overflow-y-auto px-4 pb-36 space-y-5 min-h-0">

          {/* Selected File Queue Chips */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1.5 animate-message">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Files Queue
              </span>
              <div className="space-y-1">
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] text-xs">
                    <div className="flex items-center gap-1.5 overflow-hidden pr-2">
                      {file.type === 'application/pdf' ? (
                        <FileText className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      )}
                      <span className="text-[var(--text-primary)] truncate font-semibold">
                        {file.name}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-[var(--text-muted)] hover:text-red-500 rounded-full"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hidden Inputs */}
          <input
            type="file"
            ref={fileInputRef}
            accept="application/pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
            multiple
          />
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Patient Background Memory block */}
          {userMemory && userMemory.length > 0 && (
            <div className="space-y-1.5 animate-message">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                👤 Patient Clinical Background Memory
              </span>
              <div className="flex flex-wrap gap-1">
                {userMemory.map((mem, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full bg-[var(--bg-surface-variant)] text-[var(--text-secondary)] text-[10px] font-bold border border-[var(--border-subtle)]"
                  >
                    ⚕️ {mem}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent History files */}
          <div className="space-y-2.5 animate-message">
            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              {t.recentReports}
            </span>
            {recentReports.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[var(--border-subtle)] text-xs text-[var(--text-muted)] text-center">
                {t.noRecentReports}
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentReports.map((report) => (
                  <button
                    key={report.id}
                    onClick={() => onSelectReport(report)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-variant)] hover:bg-[var(--bg-surface)] transition-all text-left"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden pr-3">
                      <div className="p-1.5 bg-[var(--accent-glow)] text-[var(--accent-primary)] rounded-lg flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {report.fileName}
                        </p>
                        <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">{new Date(report.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {selectedFiles.length > 0 && (
            <div className="absolute bottom-16 left-0 right-0 p-3 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] z-20 animate-message">
              <button
                type="button"
                onClick={() => analyzeQueue(selectedFiles)}
                className="w-full py-3 bg-[var(--accent-primary)] hover:opacity-95 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Analysis ({selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''})</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modern Fullscreen Scanner Loading status */}
      {loading && (
        <div className="flex-1 flex flex-col justify-center items-center p-6 text-center space-y-6 animate-message">
          <style>{`
            @keyframes scanLine {
              0% { transform: translateY(-30px); }
              50% { transform: translateY(30px); }
              100% { transform: translateY(-30px); }
            }
          `}</style>
          
          <div className="relative w-16 h-16 bg-[var(--accent-glow)] rounded-full flex items-center justify-center border border-[var(--border-subtle)]">
            <div className="absolute inset-x-2 h-0.5 bg-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]" style={{
              animation: 'scanLine 2.5s ease-in-out infinite'
            }}></div>
            <FileText className="w-6 h-6 text-[var(--accent-primary)] animate-pulse" />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wide">
              {loadingStep === 'ocr' ? "Extracting Text" : loadingStep === 'extracting' ? "Formatting Files" : "AI Interpretation"}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed h-12 flex items-center justify-center font-medium">
              {loadingMessage}
            </p>
          </div>

          {/* Stepper Progress bar */}
          <div className="w-full max-w-xs grid grid-cols-3 gap-1 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-2 h-2 rounded-full transition-all ${
                loadingStep === 'extracting' ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-muted)]'
              }`} />
              <span className="text-[8px] font-bold text-[var(--text-muted)]">1. READ</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-2 h-2 rounded-full transition-all ${
                loadingStep === 'ocr' ? 'bg-[var(--accent-primary)]' : loadingStep === 'analyzing' ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-muted)]'
              }`} />
              <span className="text-[8px] font-bold text-[var(--text-muted)]">2. OCR</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-2 h-2 rounded-full transition-all ${
                loadingStep === 'analyzing' ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-muted)]'
              }`} />
              <span className="text-[8px] font-bold text-[var(--text-muted)]">3. EXPLAIN</span>
            </div>
          </div>

          <button
            onClick={() => currentController?.abort()}
            className="py-2 px-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[10px] font-bold uppercase tracking-wider"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Analysis Explanations Viewer Panel */}
      {activeReport && !loading && (
        <div className="flex-1 flex flex-col overflow-hidden h-full">
          
          {/* Action Bar */}
          <div className="py-2.5 px-4 border-b border-[var(--border-subtle)] bg-white/70 dark:bg-black/50 backdrop-blur-md flex items-center justify-between z-20">
            <button
              onClick={() => onAnalysisComplete({ id: '', fileName: '', description: '' })}
              className="text-xs font-bold text-[var(--accent-primary)] hover:underline uppercase tracking-wide"
            >
              ← Close Report
            </button>

            <div className="flex gap-2">
              <button
                onClick={shareReportText}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-variant)] text-[var(--text-secondary)]"
                title={t.shareReport}
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={downloadSummaryFile}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-variant)] text-[var(--text-secondary)]"
                title={t.downloadSummary}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={printReport}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-variant)] text-[var(--text-secondary)]"
                title={t.exportPdf}
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Full content workspace */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-28">
            <div className="border-b border-[var(--border-subtle)] pb-2 animate-message">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                Structured Explanation
              </span>
              <h2 className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                {activeReport.fileName}
              </h2>
            </div>

            <div className="p-3 rounded-xl border border-amber-500/10 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs leading-relaxed flex items-start gap-2 animate-message">
              <span className="text-sm">💡</span>
              <p>{t.halfExplanationAlert}</p>
            </div>

            <div className="text-sm text-[var(--text-secondary)] space-y-1 animate-message leading-relaxed">
              {renderFormattedMarkdown(activeReport.description)}
            </div>

            <div className="pt-4 border-t border-[var(--border-subtle)] text-center space-y-3 animate-message">
              <p className="text-xs text-[var(--text-muted)]">
                Have specific queries about terms or levels listed? Switch to the chat panel now.
              </p>
              <button
                onClick={onNavigateToChat}
                className="flex items-center justify-center gap-2 py-3 px-5 bg-[var(--accent-primary)] hover:opacity-90 text-white rounded-xl font-bold text-xs shadow-sm w-full"
              >
                <span>Discuss with Gemvora AI</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
