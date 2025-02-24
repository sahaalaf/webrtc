import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:3000");

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(false);
  const pendingCandidates = useRef([]); // Store ICE candidates if needed

  useEffect(() => {
    const initWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setLocalStream(stream);

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        peerConnectionRef.current = pc;

        // Add local stream tracks to PeerConnection
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Handle remote stream
        pc.ontrack = (event) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        };

        // ICE candidate handling
        pc.onicecandidate = (event) => {
          if (event.candidate) socket.emit("ice-candidate", event.candidate);
        };

        // Handle Offer (Incoming Call)
        socket.on("offer", async (offer) => {
          setIncomingCall(true);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", answer);

          // Apply stored ICE candidates
          pendingCandidates.current.forEach(async (candidate) => {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          });
          pendingCandidates.current = [];
        });

        // Handle Answer
        socket.on("answer", async (answer) => {
          if (!pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        // Handle ICE Candidate
        socket.on("ice-candidate", async (candidate) => {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            pendingCandidates.current.push(candidate);
          }
        });

      } catch (error) {
        console.error("Error initializing WebRTC:", error);
      }
    };

    initWebRTC();

    return () => {
      if (peerConnectionRef.current) peerConnectionRef.current.close();
    };
  }, []);

  const startCall = async () => {
    const pc = peerConnectionRef.current;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", offer);
  };

  return (
    <div className="App">
      <h1>Simple WebRTC</h1>
      <div className="video-container">
        <video ref={localVideoRef} autoPlay muted></video>
        <video ref={remoteVideoRef} autoPlay></video>
      </div>
      <button onClick={startCall}>Start Call</button>

      {incomingCall && (
        <div className="notification">
          <p>Incoming Call...</p>
          <button onClick={() => setIncomingCall(false)}>Accept</button>
        </div>
      )}
    </div>
  );
}

export default App;
