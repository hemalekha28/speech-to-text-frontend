"use client"

import { useState, useEffect } from "react"
import { Mic, MicOff, Volume2, Copy, Download, Trash2, Clock, Globe } from "lucide-react"

function App() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [recognition, setRecognition] = useState(null)
  const [isSupported, setIsSupported] = useState(true)
  const [copySuccess, setCopySuccess] = useState(false)
  const [history, setHistory] = useState([])
  const [useWhisper, setUseWhisper] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [audioChunks, setAudioChunks] = useState([])
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [recordingTimer, setRecordingTimer] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchSavedTranscripts()
    checkServerHealth()
  }, [])

  // Check server health and configuration
  const checkServerHealth = async () => {
    try {
      const response = await fetch("https://speech-to-text-backend-06uq.onrender.com/health")
      const data = await response.json()
      console.log("Server health check:", data)

      if (!data.openai_key_configured) {
        setError("OpenAI API key not configured on server. Whisper functionality will not work.")
      }
    } catch (err) {
      console.error("Server health check failed:", err)
      setError("Cannot connect to server. Make sure the server is running on port 5000.")
    }
  }

  const fetchSavedTranscripts = async () => {
    try {
      const response = await fetch("https://speech-to-text-backend-06uq.onrender.com/transcriptions")
      const data = await response.json()
      if (data.success) {
        setHistory(data.data)
        console.log("Fetched transcripts:", data.data.length)
      }
    } catch (err) {
      console.error("Error fetching saved transcripts:", err)
    }
  }

  // WebKit Speech Recognition setup
  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognitionInstance = new SpeechRecognition()

      recognitionInstance.continuous = true
      recognitionInstance.interimResults = true
      recognitionInstance.lang = "en-US"

      recognitionInstance.onresult = (event) => {
        let finalTranscript = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          }
        }
        if (finalTranscript) {
          setTranscript((prev) => {
            const updated = prev + finalTranscript + " "
            saveTranscriptToBackend(finalTranscript, null, "webkit")
            return updated
          })
        }
      }

      recognitionInstance.onerror = (event) => {
        console.error("Speech recognition error:", event.error)
        setError(`WebKit Speech Recognition error: ${event.error}`)
        setIsListening(false)
      }

      recognitionInstance.onend = () => {
        setIsListening(false)
      }

      setRecognition(recognitionInstance)
    } else {
      setIsSupported(false)
    }
  }, [])

  // Fixed setupMediaRecorder function - moved outside useEffect
  const setupMediaRecorder = async () => {
    try {
      console.log("Setting up media recorder for Whisper...")
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100, // Changed from 16000 to 44100 for better compatibility
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      
      console.log("✅ Microphone access granted")

      // Try different MIME types based on browser support
      let mimeType = "audio/webm;codecs=opus"
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm"
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/mp4"
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "" // Let browser choose
          }
        }
      }

      console.log("Using MIME type:", mimeType || "browser default")

      const recorderOptions = mimeType ? { mimeType } : {}
      const recorder = new MediaRecorder(stream, recorderOptions)

      recorder.ondataavailable = (event) => {
        console.log("Data available:", event.data.size, "bytes")
        if (event.data.size > 0) {
          setAudioChunks((prev) => [...prev, event.data])
        }
      }

      recorder.onstop = () => {
        console.log("Recorder stopped, processing audio...")
        // Add delay to ensure all chunks are collected
        setTimeout(() => {
          processWhisperSpeech()
        }, 100)
      }

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error)
        setError(`Recording error: ${event.error}`)
      }

      setMediaRecorder(recorder)
      
    } catch (err) {
      console.error("Error accessing microphone:", err)
      setError(`Microphone access denied: ${err.message}`)
    }
  }

  // Fixed useEffect for media recorder setup
  useEffect(() => {
    if (useWhisper && !mediaRecorder) {
      setupMediaRecorder()
    }
  }, [useWhisper])

  // Fixed timer useEffect - replace completely
  useEffect(() => {
    let timer = null
    
    if (isListening && useWhisper) {
      console.log("Starting recording timer...")
      timer = setInterval(() => {
        setRecordingDuration((prev) => {
          const newDuration = prev + 1
          console.log("Recording duration:", newDuration, "seconds")
          return newDuration
        })
      }, 1000)
      setRecordingTimer(timer)
    } else {
      // Stop and clear timer
      if (recordingTimer) {
        console.log("Stopping recording timer...")
        clearInterval(recordingTimer)
        setRecordingTimer(null)
      }
      if (!isListening) {
        setRecordingDuration(0)
      }
    }

    // Cleanup function
    return () => {
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [isListening, useWhisper])

  // Fixed startListening function - replace completely
  const startListening = () => {
    setError("") // Clear any previous errors
    console.log("🎤 Start listening called. UseWhisper:", useWhisper)

    if (useWhisper) {
      if (!mediaRecorder) {
        setError("Microphone not ready. Please wait or refresh the page.")
        return
      }
      
      console.log("🎤 Starting Whisper recording...")
      console.log("MediaRecorder state:", mediaRecorder.state)
      
      // Clear previous data
      setAudioChunks([])
      setRecordingDuration(0)

      try {
        if (mediaRecorder.state === "inactive") {
          mediaRecorder.start(100) // Collect data every 100ms for better reliability
          setIsListening(true)
          console.log("✅ Whisper recording started")
        } else {
          console.log("MediaRecorder not in inactive state:", mediaRecorder.state)
          setError("Recorder is busy. Please try again.")
        }
      } catch (err) {
        console.error("Error starting recording:", err)
        setError(`Failed to start recording: ${err.message}`)
      }
    } else if (recognition) {
      console.log("🎤 Starting WebKit speech recognition...")
      try {
        recognition.start()
        setIsListening(true)
        console.log("✅ WebKit recognition started")
      } catch (err) {
        console.error("Error starting WebKit recognition:", err)
        setError(`Failed to start WebKit recognition: ${err.message}`)
      }
    } else {
      setError("No recognition method available")
    }
  }

  // Fixed stopListening function - replace completely
  const stopListening = () => {
    console.log("⏹️ Stop listening called")
    
    if (useWhisper && mediaRecorder) {
      console.log("⏹️ Stopping Whisper recording...")
      console.log("MediaRecorder state before stop:", mediaRecorder.state)
      
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop()
        setIsListening(false)
        console.log("✅ Whisper recording stopped")
      } else {
        console.log("MediaRecorder not recording, state:", mediaRecorder.state)
        setIsListening(false)
      }
    } else if (recognition) {
      console.log("⏹️ Stopping WebKit recognition...")
      recognition.stop()
      setIsListening(false)
      console.log("✅ WebKit recognition stopped")
    }
  }

  const clearTranscript = () => {
    setTranscript("")
    setError("")
  }

  const saveTranscriptToBackend = async (
    text,
    confidence = null,
    method = "webkit",
    language = null,
    duration = null,
  ) => {
    try {
      const response = await fetch("https://speech-to-text-backend-06uq.onrender.com/transcriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, confidence, method, language, duration }),
      })
      const data = await response.json()
      if (!data.success) {
        console.error("Failed to save:", data.message)
      }
    } catch (err) {
      console.error("Error saving transcript:", err)
    }
  }

  // Fixed processWhisperSpeech function - update completely
  const processWhisperSpeech = async () => {
    console.log("🔄 Processing Whisper speech...")
    console.log("Audio chunks available:", audioChunks.length)

    if (audioChunks.length === 0) {
      console.log("❌ No audio chunks to process")
      setError("No audio data recorded. Try speaking for a longer duration.")
      return
    }

    setIsProcessing(true)

    try {
      // Create blob with the recorded MIME type
      const mimeType = mediaRecorder?.mimeType || "audio/webm;codecs=opus"
      const audioBlob = new Blob(audioChunks, { type: mimeType })
      
      console.log("📦 Created audio blob:")
      console.log("  - Size:", audioBlob.size, "bytes")
      console.log("  - Type:", audioBlob.type)

      if (audioBlob.size === 0) {
        console.log("❌ Audio blob is empty")
        setError("No audio data captured. Please try again.")
        return
      }

      if (audioBlob.size < 1000) { // Less than 1KB is probably too small
        console.log("❌ Audio blob too small:", audioBlob.size, "bytes")
        setError("Recording too short. Please speak for at least 1-2 seconds.")
        return
      }

      if (audioBlob.size > 25 * 1024 * 1024) {
        console.log("❌ File too large:", audioBlob.size, "bytes")
        setError("Recording too large. Maximum size is 25MB. Try shorter recordings.")
        return
      }

      const formData = new FormData()
      // Use proper filename extension based on MIME type
      const extension = mimeType.includes('webm') ? 'webm' : 'wav'
      formData.append("audio", audioBlob, `recording.${extension}`)

      console.log("📡 Sending to server...")

      const response = await fetch("https://speech-to-text-backend-06uq.onrender.com/transcribe-audio", {
        method: "POST",
        body: formData,
      })

      console.log("📡 Server response:")
      console.log("  - Status:", response.status)
      console.log("  - OK:", response.ok)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Server error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      console.log("📄 Response data:", data)

      if (data.success) {
        console.log("✅ Transcription successful:", data.transcript)
        setTranscript((prev) => prev + data.transcript + " ")
        fetchSavedTranscripts() // Refresh the history
        setError("") // Clear any previous errors
      } else {
        console.error("❌ Transcription failed:", data.message)
        setError(`Transcription failed: ${data.message}`)
      }
    } catch (error) {
      console.error("💥 Error sending audio:", error)
      setError(`Error processing audio: ${error.message}`)
    } finally {
      setIsProcessing(false)
      setAudioChunks([]) // Clear chunks after processing
    }
  }

  const copyToClipboard = async () => {
    if (transcript) {
      try {
        await navigator.clipboard.writeText(transcript)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch (err) {
        console.error("Failed to copy text: ", err)
        // Fallback for older browsers
        const textArea = document.createElement("textarea")
        textArea.value = transcript
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      }
    }
  }

  const downloadTranscript = () => {
    if (transcript) {
      const element = document.createElement("a")
      const file = new Blob([transcript], { type: "text/plain" })
      element.href = URL.createObjectURL(file)
      element.download = `speech-transcript-${new Date().toISOString().split("T")[0]}.txt`
      document.body.appendChild(element)
      element.click()
      document.body.removeChild(element)
    }
  }

  const speakText = () => {
    if (transcript && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(transcript)
      speechSynthesis.speak(utterance)
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  if (!isSupported && !useWhisper) {
    return (
      <div className="unsupported-container">
        <div className="unsupported-card">
          <h1>Speech to Text</h1>
          <div className="error-message">
            Speech recognition is not supported in your browser. Please try Chrome or Edge, or enable Whisper API.
          </div>
          <button onClick={() => setUseWhisper(true)} className="enable-whisper-btn">
            Use Whisper API
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <h1 className="main-title">Speech to Text Recognition</h1>

        {/* Error display */}
        {error && <div className="error-banner">⚠️ {error}</div>}

        {/* Method toggle */}
        <div className="method-toggle-card">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useWhisper}
              onChange={(e) => {
                setUseWhisper(e.target.checked)
                setError("") // Clear errors when switching
              }}
              className="checkbox-input"
            />
            <span className="checkbox-text">Use OpenAI Whisper API (Higher Accuracy, Multiple Languages)</span>
          </label>
        </div>

        <div className="control-card">
          <div className="control-buttons">
            <button
              onClick={isListening ? stopListening : startListening}
              className={`mic-button ${isListening ? "mic-button-stop" : "mic-button-start"}`}
              disabled={isProcessing || (useWhisper && !mediaRecorder)}
            >
              {isListening ? <MicOff size={24} /> : <Mic size={24} />}
              <span>{isProcessing ? "Processing..." : isListening ? "Stop Listening" : "Start Listening"}</span>
            </button>

            <div className="action-buttons">
              <button onClick={clearTranscript} className="action-btn clear-btn">
                <Trash2 size={18} />
                <span>Clear</span>
              </button>

              {transcript && (
                <>
                  <button
                    onClick={copyToClipboard}
                    className={`action-btn ${copySuccess ? "copy-success" : "copy-btn"}`}
                  >
                    <Copy size={18} />
                    <span>{copySuccess ? "Copied!" : "Copy"}</span>
                  </button>

                  <button onClick={downloadTranscript} className="action-btn download-btn">
                    <Download size={18} />
                    <span>Download</span>
                  </button>

                  <button onClick={speakText} className="action-btn speak-btn">
                    <Volume2 size={18} />
                    <span>Speak</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Enhanced status display */}
          <div className="status-display">
            {isProcessing ? (
              <div className="status-processing">
                <div className="spinner"></div>
                <span>Processing with Whisper API... Please wait...</span>
              </div>
            ) : isListening ? (
              <div className="status-listening">
                <div className="mic-icon">🎤</div>
                <span>
                  Listening... ({useWhisper ? "Whisper" : "WebKit"})
                  {useWhisper && ` - ${formatDuration(recordingDuration)}`}
                </span>
              </div>
            ) : useWhisper && !mediaRecorder ? (
              <span className="status-error">Setting up microphone for Whisper...</span>
            ) : (
              <span className="status-idle">Click the microphone to start</span>
            )}
          </div>

          <div className="transcript-section">
            <h3 className="transcript-title">Transcript:</h3>
            <div className="transcript-box">{transcript || "Your speech will appear here..."}</div>
          </div>

          {/* Debug info (only show in development) */}
          {process.env.NODE_ENV === "development" && (
            <div className="debug-info">
              <strong>Debug Info:</strong>
              <br />
              Method: {useWhisper ? "Whisper" : "WebKit"}
              <br />
              MediaRecorder: {mediaRecorder ? "Ready" : "Not ready"}
              <br />
              Audio chunks: {audioChunks.length}
              <br />
              Is listening: {isListening ? "Yes" : "No"}
              <br />
              Is processing: {isProcessing ? "Yes" : "No"}
              <br />
              {useWhisper && `Recording duration: ${recordingDuration}s`}
            </div>
          )}
        </div>

        <div className="history-card">
          <h3 className="history-title">Saved Transcripts ({history.length}):</h3>
          <div className="history-list">
            {history.length === 0 ? (
              <p className="no-history">No saved transcripts yet</p>
            ) : (
              history.map((item) => (
                <div key={item._id} className="history-item">
                  <div className="history-text">{item.text}</div>
                  <div className="history-meta">
                    <span className="meta-item">
                      <span>Method: {item.method || "webkit"}</span>
                    </span>
                    {item.language && (
                      <span className="meta-item">
                        <Globe size={14} />
                        <span>{item.language}</span>
                      </span>
                    )}
                    {item.duration && (
                      <span className="meta-item">
                        <Clock size={14} />
                        <span>{item.duration.toFixed(1)}s</span>
                      </span>
                    )}
                    {item.confidence && (
                      <span className="meta-item">Confidence: {(item.confidence * 100).toFixed(1)}%</span>
                    )}
                    <span className="meta-item">{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App