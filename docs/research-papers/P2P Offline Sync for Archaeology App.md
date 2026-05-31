# **Architectural Research for True Peer-to-Peer, Offline-First Synchronization in Archaeological Fieldwork Applications**

## **Introduction to Decentralized Stratigraphic Mapping**

The transition of digital stratigraphy and archaeological data management from centralized cloud infrastructures to remote, severely disconnected environments requires a profound architectural paradigm shift. Applications executing complex data structures—such as Harris Matrices represented via Conflict-free Replicated Data Types (CRDTs)—must rely on robust local-first topologies. The challenge of enabling true peer-to-peer (P2P) synchronization across a local area network (LAN) or Ad-hoc Wi-Fi network without the presence of a central router or internet access introduces severe constraints regarding service discovery, peer signaling, transport layer reliability, and aggressive operating system-level firewalls.  
Archaeological fieldwork presents an exceptionally hostile networking environment. Devices such as laptops and tablets are frequently deployed in deep trenches, remote survey areas, or subterranean excavations where external connectivity is non-existent. A traditional client-server architecture fails under these conditions because the central source of truth—the server—cannot be reached. Even attempting to designate a single tablet as a local "host" server is structurally fragile; if the archaeologist carrying the host device moves out of range or puts the device to sleep, the entire data synchronization mesh collapses, resulting in fragmented data silos across the excavation site.  
To solve this, the application architecture must evolve into a fully decentralized, self-healing mesh network. Every node must be capable of autonomously discovering nearby peers, establishing direct connections, and resolving data conflicts locally without external mediation. Yjs, a high-performance CRDT framework, provides the mathematical foundation for this conflict-free resolution through logical timestamps and state vectors.1 However, the underlying transport and discovery mechanisms require a bespoke engineering approach. This report delivers an exhaustive technical blueprint for migrating a standard WebSocket-reliant application wrapped in Tauri v2 into a fully autonomous, offline-first decentralized mesh. By leveraging Multicast DNS (mDNS) for zero-configuration network discovery, embedding highly concurrent WebSocket servers directly within the Rust backend, and utilizing the raw binary synchronization protocols of the Rust-native Yjs port, a resilient offline architecture can be definitively established.

## **Zero-Configuration Networking (mDNS) in Tauri**

In the absolute absence of a central server to broker connections, track dynamic IP addresses, or manage DNS records, devices operating on an isolated network must actively broadcast their presence and simultaneously listen for the presence of other peers. Multicast DNS (mDNS) coupled with DNS-based Service Discovery (DNS-SD) serves as the industry standard protocol for zero-configuration networking. Operating over UDP port 5353, mDNS allows nodes on a local subnet to resolve hostnames ending in .local and discover specific application services without requiring a traditional DNS server.

### **Evaluation of the Rust mDNS Ecosystem**

The Rust ecosystem provides several distinct libraries for implementing mDNS and Service Discovery. Each crate operates under different architectural philosophies, threading models, and dependency chains. A rigorous comparative evaluation is necessary to select a foundational crate that is suitable for cross-platform desktop applications (Windows, macOS, Linux) deployed via the Tauri v2 framework.

| Crate Identifier | Architectural Model & Dependencies | Stability, Constraints, and Maintenance Profile | Selection Verdict |
| :---- | :---- | :---- | :---- |
| **zeroconf** | Wraps native Operating System implementations (Bonjour on Apple/Windows ecosystems, Avahi on Linux) via Foreign Function Interfaces (FFI) utilizing avahi-sys and bonjour-sys.3 | Requires Clang at build-time and external C-headers. Highly prone to cross-compilation errors. Introduces unpredictable runtime behavior on Linux environments lacking running Avahi daemons.4 | **Discard.** OS-native bindings introduce severe brittleness and deployment complexity in standalone desktop application distribution. |
| **libmdns** | A pure Rust implementation, originally starting as a fork of the plietar/rust-mdns project.5 | Heavily bound to older iterations of the tokio 1.0 runtime. The Minimum Supported Rust Version (MSRV) is restricted. Maintenance is highly sporadic, with no active feature development or dedicated support.5 | **Discard.** Unmaintained underlying network infrastructure poses an unacceptable long-term security and stability risk. |
| **mdns-sd** | A pure Rust implementation with absolutely zero async-runtime dependencies. Relies entirely on standard library threads and highly efficient communication channels (flume).6 | Highly stable and robust. Supports unblocking try\_send APIs, ensuring it does not clash with or block Tauri's internal tokio asynchronous runtimes.7 Utilized reliably across both embedded systems and desktop software.9 | **Optimal Choice.** Delivers predictable, runtime-agnostic, and deeply cross-platform networking without external C-dependencies. |

The mdns-sd crate emerges as the definitively optimal foundation for the application. Its non-blocking, multi-threaded architecture allows it to run a background daemon thread seamlessly alongside Tauri's primary event loop and the embedded transport servers, completely isolating discovery overhead from UI performance.7

### **Architectural Best Practices for Tauri Plugin Integration**

To expose mDNS discovery to the React and TypeScript frontend, the Tauri Rust backend must encapsulate the mdns-sd daemon within Tauri's managed application state. The backend architecture is responsible for two concurrent, continuous operations: broadcasting its own local server instance to the network and continuously scanning the network for remote instances.

#### **Designing the Service Registration**

The application must advertise a standard, unique service type, typically formatted according to RFC standards as \_applicationname.\_tcp.local.. For this specific architectural implementation, a fully qualified string such as \_stratigraph.\_tcp.local. is highly appropriate.7 The broadcast must be meticulously constructed to contain the following vital routing information:  
Firstly, the payload must include the IP Address. This is the local LAN IP address of the machine on the Ad-hoc network. The mdns-sd crate features the ability to automatically detect this address using the enable\_addr\_auto() method, although specific network interface binding via supplementary crates like network-interface or if-addrs is highly recommended for devices with multiple Network Interface Cards (NICs) to ensure the broadcast routes over the correct Wi-Fi adapter.6  
Secondly, the broadcast must explicitly declare the Port. This will be the dynamically allocated port of the embedded local signaling or transport server running within the Tauri application. By allocating port 0 to the server at startup, the operating system assigns a random, guaranteed-available port, avoiding conflicts. This exact port number is then injected directly into the mDNS registration.7  
Thirdly, the service registration must utilize TXT Records. These are custom key-value property arrays broadcast alongside the core DNS records. They are critical for application-specific metadata. The properties should encapsulate data such as the room\_id, the active project\_name, and the human-readable device\_name. By placing the room\_id in the TXT records, peers can filter out discovered devices that are operating on different archaeological projects within the same physical network without needing to establish a transport connection first.7

#### **Continuous Discovery and the Tauri IPC Channel Bridging**

Streaming discovery events directly up to the React frontend is a critical requirement for rendering a live, highly responsive "Nearby Devices" interface for the user. While Tauri's standard Event System (accessed via app.emit) is functional for basic lifecycle triggers, it is not architecturally optimized for continuous, ordered streaming data. Global events suffer from serialization overhead across the entire application scope and lack strict delivery guarantees.15  
Tauri v2 introduces the tauri::ipc::Channel API, which establishes an extraordinarily efficient, asynchronous, point-to-point data stream from the Rust backend directly to a specific frontend consumer.15 The channel bypasses global event listeners, acting as a dedicated pipe. The backend spawns an asynchronous listener thread that loops continuously over the mdns-sd browse receiver. As mDNS ServiceResolved or ServiceRemoved events trigger, the thread translates these discovered service records into structured JSON payloads and pushes them down the IPC Channel.7 The React frontend, utilizing standard React Hooks, simply consumes this channel stream to update local UI state in real-time.

## **Signaling Without a Central Server: The Transport Fallacy**

The conventional approach to engineering peer-to-peer browser applications relies heavily on the WebRTC protocol. Modules such as y-webrtc abstract away the complexity of connecting users and handling bidirectional data channel multiplexing.1 However, WebRTC was explicitly and historically designed to overcome Network Address Translation (NAT) and strict firewalls across the open, public internet. To achieve this, WebRTC relies intrinsically on the exchange of Session Description Protocol (SDP) offers and answers, alongside the aggressive gathering of Interactive Connectivity Establishment (ICE) candidates from remote STUN and TURN servers.1

### **The WebRTC Signaling Paradox in Offline Environments**

In an architecture operating exclusively on a physically disconnected, offline LAN or Ad-hoc Wi-Fi network, NAT traversal is largely, if not entirely, irrelevant because all peer devices occupy the identical local subnet. Attempting to force WebRTC into this scenario introduces severe architectural friction and performance degradation.  
The most prominent issue is the signaling paradox. WebRTC strictly requires an out-of-band signaling mechanism to exchange the aforementioned SDPs before a peer-to-peer connection can even begin to materialize. If the devices are completely offline, a local signaling server must be built and distributed on the devices themselves. Furthermore, WebRTC state machines often spend valuable, unskippable seconds attempting to gather ICE candidates from non-existent external STUN servers before eventually timing out and falling back to local host network candidates. This behavior leads to massive, frustrating connection delays in offline environments.

### **Evaluating Local Signaling Server Feasibility**

If the architectural decision is made to stubbornly pursue WebRTC, a lightweight signaling mechanism must be established locally. The feasibility of spinning up a lightweight HTTP or WebSocket server within the Tauri Rust backend on each device is entirely sound. Frameworks like axum paired with tokio-tungstenite allow for highly concurrent, deeply embedded web servers that consume negligible system resources.20  
The mDNS broadcast can absolutely include the port of this local signaling server. The workflow would operate as follows: Device A discovers Device B via mDNS, extracting Device B's IP and port. Device A's frontend instructs its backend to construct a WebRTC SDP offer. Instead of routing this offer to a central cloud server, Device A issues an HTTP POST request containing the SDP payload directly to http://:/signaling. Device B's axum server receives the offer, processes it, generates an SDP answer, and returns it in the HTTP response. The peers then repeat this process for ICE candidates.

#### **Modifying the y-webrtc Architecture**

If this WebRTC pathway is chosen, modifying y-webrtc to accept local P2P signaling instead of a remote WebSocket URL is a complex but manageable task. The y-webrtc library relies on a central SignalingConn class that maintains a WebSocket connection to public servers (e.g., wss://signaling.yjs.dev).2  
To modify this behavior, a developer must create a custom signaling provider class that interfaces directly with the y-webrtc room mechanisms. Instead of listening for onmessage events from a remote WebSocket, this custom class must expose an API to the Tauri frontend. When the Tauri backend receives an HTTP signaling request from a local peer via the axum server, it passes that payload up to the React frontend via Tauri IPC. The custom signaling class intercepts this payload, mimics the event structure of a remote WebSocket message, and feeds the SDP data directly into the underlying WebRTC RTCPeerConnection instance. While technically viable, this process is convoluted, heavily fragments the application state across the IPC boundary, and retains the inherent latency of ICE gathering timeouts.

### **The Raw WebSocket Paradigm**

The realization that an embedded axum server is required for local WebRTC signaling reveals a critical architectural redundancy: if a highly concurrent, robust local server must be instantiated merely to handle the signaling handshake, that exact same server is entirely capable of handling the direct transport of the Yjs binary data itself. Bypassing WebRTC entirely and replacing the WebRTC data channels with raw TCP/WebSocket connections between the local Tauri instances provides a vastly superior, lower-latency, and highly deterministic network topology.21  
By utilizing axum and tokio-tungstenite, every Tauri application essentially becomes a distributed node in a true local mesh, functioning as both a client and a highly concurrent WebSocket gateway simultaneously.20 The architecture transforms gracefully from a pseudo-P2P WebRTC model into a pure distributed local mesh of WebSocket servers. When the frontend's React layer initializes, the Tauri backend spins up the axum server bound to 0.0.0.0:0, allowing the operating system to assign a random available port. This assigned port is immediately passed to the mDNS daemon for network-wide broadcast.7  
When Device A discovers Device B via mDNS, Device A does not engage in complex SDP generation. Instead, it simply instantiates a standard WebSocket connection directly to ws://:/sync. This completely eliminates ICE gathering delays, complex NAT traversal logic, and the fragile WebRTC state machine, resulting in instantaneous connection establishment over the LAN.

## **Yjs Integration and Transport Layers**

The synchronization of Conflict-free Replicated Data Types (CRDTs) relies on a strict, mathematically sound message exchange protocol. Yjs implements a highly optimized two-step handshake procedure, followed by the continuous streaming of binary state updates.24 Understanding the mechanics of this protocol is essential for integrating the local transport layer correctly.

### **The Mechanics of the Y-Sync Protocol**

The y-sync protocol operates primarily through the exchange of State Vectors and Update binaries.24 A State Vector is an immensely compressed, encoded representation of the logical timestamps (often conceptualized as Lamport clocks) for every client ID that a specific document instance has historically observed.

1. **Synchronization Step 1:** Upon establishing a fresh WebSocket connection, the peer initiating the connection (Peer A) encodes its current document State Vector. This tiny binary payload is transmitted to the receiving peer (Peer B).24  
2. **Synchronization Step 2:** Peer B receives the State Vector and calculates the mathematical difference between Peer A's observed state and its own local document state. Peer B then generates a minimal, highly optimized binary update containing exclusively the operations that Peer A is missing. This delta payload is sent back as a Sync Step 2 message, instantly bringing Peer A up to date.24  
3. **Continuous Update Streaming:** Once the initial handshake concludes, whenever the local document is modified by a user, a localized Update message containing the incremental change is broadcast to all connected WebSocket peers simultaneously, maintaining real-time consistency.

### **Architectural Pathways for Bridging Yjs**

There are two distinct architectural pathways for bridging the Yjs state over the embedded axum server within a Tauri application. The choice between these pathways dictates the overall stability, persistence capabilities, and performance of the application.

#### **Pathway 1: The React-to-React Bridge (Bypassing Rust for State)**

In this simplistic model, the Rust axum server functions merely as a dumb relay or proxy. The React frontend maintains the master, authoritative Y.Doc instance in the browser's memory. When the React layer connects to its own local backend via ws://127.0.0.1:\<local\_port\>, the Axum server accepts the connection and blindly relays raw binary frames to any other connected peer WebSockets on the LAN.  
While conceptually easier to implement, this architecture forces the single-threaded React UI layer to handle all heavy lifting, including binary encoding, state vector calculation, and connection multiplexing. Furthermore, if the React window is refreshed, closed, or crashes, the entire synchronization connection state drops instantly. It also isolates the Rust backend from the core application state, making offline disk persistence (such as saving the document to a local SQLite database via Rust) highly convoluted, requiring constant IPC round-trips for every document mutation.

#### **Pathway 2: The Rust-Native Yjs Engine (yrs and yrs-axum)**

The definitively superior architecture utilizes yrs, the official, highly optimized Rust port of the Yjs framework.2 Under this paradigm, the Rust backend maintains the authoritative Y.Doc strictly in native memory and persists it directly to a local SQLite database or the filesystem without ever involving the frontend. The React frontend simply connects to its own local Rust backend via an IPC WebSocket or a specialized Tauri IPC Channel, while the Rust backend independently manages the complex axum WebSocket connections to other devices on the LAN using integration crates such as yrs-axum or yrs-warp.27  
This architecture provides monumental stability and performance enhancements. Firstly, it enables Headless Synchronization. The Rust backend can continue to discover peers via mDNS, establish connections, and silently sync massive amounts of data across the LAN even if the frontend React window is entirely closed or the user is navigating away from the main view.21 Secondly, it unlocks Native Persistence. The yrs library can directly dump the document state to disk asynchronously, operating entirely outside the Tauri IPC boundary and ensuring absolute data durability during sudden power loss.  
Finally, this approach cleanly handles the Yjs Awareness protocol. The Awareness protocol is responsible for broadcasting ephemeral, non-persistent data such as user cursor positions, active selections, and online presence.2 Because awareness data relies on rapid, high-frequency broadcasts and continuous timeout management, processing this data exclusively within the highly concurrent tokio runtime prevents the React UI thread from blocking or lagging under heavy network load.26

### **Evaluating Local Network Topologies**

In a pure LAN environment, the configuration of how connections are established dictates how efficiently the CRDT state replicates across multiple nodes. Two primary network topologies govern this behavior.

| Topology Type | Architectural Description | Advantages | Disadvantages |
| :---- | :---- | :---- | :---- |
| **Star Topology (Ad-hoc Leader)** | One designated device acts as the central "host" server. All other devices connect their WebSockets exclusively to that specific host. | Exceptionally simple to implement. Requires only standard client-server y-websocket networking patterns and minimal connection logic. | Extremely fragile. Represents a single point of failure. If the archaeologist holding the host tablet puts the device to sleep or walks out of Wi-Fi range, the entire synchronization mesh collapses, halting collaboration. |
| **Full Mesh Topology** | Every device actively connects a WebSocket to every other device it discovers via mDNS. For an environment with ![][image1] devices, the network maintains exactly ![][image2] connections. | Highly resilient and robust. Any node can drop offline or join the network without disrupting the active synchronization between the remaining peers. Yjs handles redundant updates efficiently due to its mathematically idempotent state vectors.24 | Requires engineering sophisticated connection logic so that peers do not create duplicate, infinite-looping bidirectional WebSockets to one another. |

A Full Mesh topology is strictly and categorically required to survive the chaotic, unpredictable physical environment of archaeological fieldwork. To successfully engineer a full mesh and prevent the creation of duplicate connections (where Device A connects to Device B, while Device B simultaneously connects back to Device A), a simple, deterministic rule must be implemented at the discovery layer.  
The logic dictates that a device only initiates an active, outgoing WebSocket connection to a newly discovered peer if its own locally generated, unique device UUID is alphanumerically "less than" or "greater than" the peer's UUID. This creates an elegant tie-breaker scenario. If Device A (UUID: 100\) discovers Device B (UUID: 200), Device A will initiate the connection because 100 is less than 200\. When Device B discovers Device A, it recognizes that 200 is not less than 100, and therefore passively waits for Device A's incoming connection to arrive. This guarantees a clean, un-duplicated full mesh.

## **Firewall and Operating System Constraints**

Transitioning an application's architecture from making standard outbound HTTPS requests to actively listening on local TCP ports and broadcasting UDP multicast packets intrinsically and immediately triggers the defensive security mechanisms of modern operating systems.32 If these stringent constraints are not preemptively engineered and handled during the build and installation phases, the Tauri application will either fail completely silently or present end-users with severe, terrifying security warnings that block functionality.

### **macOS: App Sandbox, Info.plist, and Network Privacy**

Apple's macOS enforces exceptionally stringent App Sandbox rules, particularly concerning local network privacy and the transmission of multicast data. From the release of macOS 14 (Sonoma) and extending deeply into macOS 15 (Tahoe), strict operating system policies prevent applications from conducting local network reconnaissance or engaging in meta-service browsing without explicit, cryptographically signed entitlements and overt user permissions.34  
To ensure the Tauri application can successfully broadcast mDNS packets and bind the axum server to local ports on Apple hardware, three highly interconnected configurations are absolutely mandatory.

#### **1\. Sandbox Entitlements (Entitlements.plist)**

When compiling the application for production distribution using the tauri build command, the resulting macOS .app bundle must contain specifically structured network entitlements. Without these precise keys, the macOS kernel will aggressively, silently terminate any outbound network requests or listening sockets initiated by the embedded Rust daemon.36  
The Entitlements.plist file must declare the following structure:

XML  
\<?xml version="1.0" encoding="UTF-8"?\>  
\<\!DOCTYPE **plist** **PUBLIC** "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"\>  
\<plist version\="1.0"\>  
\<dict\>  
    \<key\>com.apple.security.app-sandbox\</key\>  
    \<true/\>  
    \<key\>com.apple.security.network.client\</key\>  
    \<true/\>  
    \<key\>com.apple.security.network.server\</key\>  
    \<true/\>  
\</dict\>  
\</plist\>

The inclusion of the com.apple.security.network.server key is critical and non-negotiable. Without it, the axum server will be denied permission to bind to 0.0.0.0 and will subsequently crash upon attempting to accept incoming WebSocket connections from peers.39 The .client entitlement is equally required for the mDNS daemon to transmit outbound multicast UDP queries.

#### **2\. Info.plist Annotations and Local Network Privacy**

Even with the correct Sandbox entitlements successfully compiled, modern macOS will silently drop all mDNS UDP packets unless the application explicitly declares its intent to utilize local network services within its core metadata. The application must also specifically enumerate the Bonjour service types it intends to browse.35  
The Tauri tauri.conf.json file must be heavily modified to inject the following specific keys directly into the compiled Info.plist:

* NSLocalNetworkUsageDescription: A clear, human-readable string explaining exactly why the application requires LAN access. This string is what triggers the initial, mandatory system prompt requesting permission from the user upon the very first network execution.34  
* NSBonjourServices: An array containing the exact service identifiers the application will utilize for mDNS discovery.

The injection within tauri.conf.json appears as follows:

JSON  
"macOS": {  
  "entitlements": "./Entitlements.plist",  
  "infoPlist": {  
    "NSLocalNetworkUsageDescription": "StratiGraph utilizes the local network to autonomously discover and synchronize critical stratigraphic sequences with nearby tablet devices in remote, offline environments.",  
    "NSBonjourServices": \["\_stratigraph.\_tcp"\]  
  }  
}

There is a crucial, easily overlooked detail regarding this configuration. The string provided within the NSBonjourServices array must flawlessly match the exact service type registered in the mdns-sd Rust daemon, *but it must strictly omit the trailing .local. domain identifier*.42 Therefore, if the Rust daemon registers \_stratigraph.\_tcp.local., the plist must register \_stratigraph.\_tcp. Failure to align these strings precisely will result in mDNS queries failing completely silently—a highly documented and frustrating pitfall, particularly on macOS Tahoe and iOS simulators.34

### **Windows: Windows Defender Firewall and WiX Customization**

On the Windows operating system, the primary and most aggressive obstacle is the integrated Windows Defender Firewall. When the embedded axum server attempts to bind to the 0.0.0.0 interface, Windows will instantly intercept the action at the kernel level and display a highly prominent, intrusive warning prompt asking the user to manually allow the application through the firewall for both Private and Public network profiles. In tightly controlled environments, standard users may entirely lack the administrative privileges required to accept this prompt, effectively breaking all P2P functionality immediately upon launch.  
To successfully mitigate this disruption, the firewall exception must be preemptively granted during the installation phase, where the installer process has already secured administrative privileges via User Account Control (UAC). Tauri relies on the WiX Toolset v3 engine to generate highly customized .msi Windows installers.47 The standard WiX configuration can be powerfully extended to include the WixFirewallExtension, which injects the necessary firewall allowance rules directly into the OS registry during the software installation sequence.49  
The developer must create a custom .wxs file that overrides the default Tauri installer logic and manually add the FirewallException node. This node must target both the TCP protocol (to allow the Axum web server to function) and the UDP protocol (to allow the mDNS multicast traffic to flow unhindered).49  
The structural XML modification requires the following integration:

XML  
\<Wix xmlns\="http://schemas.microsoft.com/wix/2006/wi"   
     xmlns:fire\="http://schemas.microsoft.com/wix/FirewallExtension"\>  
    \<Component Id\="MainExecutable" Guid\="\*"\>  
        \<File Id\="StratiGraphExe" Source\="StratiGraph.exe" KeyPath\="yes"\>  
            \<fire:FirewallException Id\="FW\_TCP\_SYNC" Name\="StratiGraph Local Sync (TCP)" Profile\="all" Protocol\="tcp" Scope\="any" IgnoreFailure\="yes" /\>  
            \<fire:FirewallException Id\="FW\_UDP\_MDNS" Name\="StratiGraph Discovery (UDP)" Profile\="all" Protocol\="udp" Scope\="any" IgnoreFailure\="yes" /\>  
        \</File\>  
    \</Component\>  
    \</Wix\>

To successfully compile this customized installer, the WiX configuration block within tauri.conf.json must be explicitly adjusted to pass the \-ext WixFirewallExtension flag into both the candle.exe and light.exe compiler stages, ensuring the extension schema is loaded properly during the .msi generation.49

### **Linux: AppArmor, Snap Confinement, and Network Interfaces**

Linux distributions relying on modern, containerized packaging formats such as AppImage or Canonical's Snap introduce their own highly specific network constraints. Snap packages, by absolute default, execute within a state of strict confinement, utilizing AppArmor profiles to block access to host resources. To allow the axum server and the mdns-sd daemon to function properly within a Snap package, the snapcraft.yaml configuration must explicitly declare and automatically plug both the network and network-bind security interfaces, granting the necessary socket permissions.51  
AppImages, conversely, generally inherit the host system's native networking permissions but may struggle severely with mDNS discovery if the host OS utilizes aggressive iptables or ufw policies that actively block inbound traffic on port 5353 (the universally standard mDNS UDP port).33 Furthermore, the mdns-sd daemon may require highly specific, manual interface enumeration logic on Linux workstations heavily utilizing complex virtual network bridges (such as Docker's docker0 interface). If not carefully managed, the mDNS broadcast may be erroneously routed into a local virtual container bridge rather than out over the physical Wi-Fi interface connected to the Ad-hoc field network.13

## **Technical Implementation Roadmap and Structural Pseudocode**

Deploying this highly sophisticated architecture requires a methodical, phased engineering approach, migrating the application safely from central WebSocket reliance to a fully decentralized, embedded mesh.

### **Phase 1: Embedding the Rust-Native Yjs Engine (yrs)**

The initial phase involves decoupling the application from its cloud reliance. The centralized WebSocket provider must be entirely stripped from the React frontend. In its place, the yrs crate is deeply integrated into the Tauri Rust backend, officially establishing the backend as the ultimate, authoritative source of truth for the local application state.  
An internal communication bridge is then established. The React frontend connects to the local backend using a custom IPC-based Yjs provider, ensuring real-time UI updates. Concurrently, logic must be implemented in Rust to ensure all local modifications received from the React layer are immediately and asynchronously persisted to a local SQLite database, guaranteeing offline durability.

### **Phase 2: Instantiating the Axum Transport Layer**

The second phase introduces the local transport mechanics. The axum web framework and tokio-tungstenite are implemented to run concurrently on an asynchronous thread alongside the main Tauri application loop. The server is strictly bound to 0.0.0.0:0 to acquire a dynamic, globally accessible port.  
Integration with the yrs-axum crate is finalized, exposing the internal Y.Doc state over highly concurrent local WebSocket routes.30 The system must be comprehensively tested by launching multiple local instances of the application on a single machine and verifying that the y-sync protocol accurately and consistently merges State Vectors across the local loopback interface.  
**Structural Pseudocode for yrs-axum Integration (src-tauri/src/axum\_sync.rs):**

Rust  
use axum::{extract::ws::{WebSocket, WebSocketUpgrade}, routing::get, Router};  
use std::sync::Arc;  
use tokio::sync::broadcast;  
use yrs::{Doc, Update};  
use y\_sync::awareness::Awareness;

pub async fn start\_axum\_server(doc: Arc\<Doc\>) \-\> u16 {  
    // Wrap the document in the awareness protocol for cursor tracking  
    let awareness \= Arc::new(tokio::sync::RwLock::new(Awareness::new(doc)));  
      
    // Y-sync requires broadcast channels for continuous update streaming  
    let (tx, \_rx) \= broadcast::channel(100);  
      
    let app \= Router::new().route("/sync", get(move |ws: WebSocketUpgrade| {  
        let awareness \= awareness.clone();  
        async move {  
            // Upgrade the incoming HTTP request to a raw WebSocket connection  
            ws.on\_upgrade(move |socket| handle\_yjs\_socket(socket, awareness))  
        }  
    }));

    // Bind to all interfaces (0.0.0.0) with a dynamic port (0)  
    let listener \= tokio::net::TcpListener::bind("0.0.0.0:0").await.unwrap();  
    let local\_addr \= listener.local\_addr().unwrap();  
      
    // Spawn the server asynchronously so it does not block the Tauri UI  
    tauri::async\_runtime::spawn(async move {  
        axum::serve(listener, app).await.unwrap();  
    });

    // Return the dynamic port so the mDNS daemon can broadcast it  
    local\_addr.port()   
}

async fn handle\_yjs\_socket(ws: WebSocket, awareness: Arc\<tokio::sync::RwLock\<Awareness\>\>) {  
    // Utilize yrs-axum internal protocols to handle Sync Step 1 and Step 2  
    // and begin broadcasting local document updates to the connected peer.  
}

### **Phase 3: Zero-Configuration Discovery Implementation**

The third phase connects the transport layer to the physical network. The mdns-sd crate is integrated. The dynamically allocated axum port returned from Phase 2 is immediately passed into the ServiceInfo::new constructor for broadcast.  
The continuous discovery loop is engineered, deliberately utilizing the tauri::ipc::Channel to efficiently stream discovered LAN peers up to the React frontend interface.15  
**Structural Pseudocode for mDNS Integration (src-tauri/src/mdns\_plugin.rs):**

Rust  
use mdns\_sd::{ServiceDaemon, ServiceInfo};  
use tauri::{ipc::Channel, AppHandle, Runtime, State};

pub struct MdnsState {  
    pub daemon: ServiceDaemon,  
}

\#  
\#\[serde(tag \= "type")\]  
pub enum PeerEvent {  
    Found { ip: String, port: u16, room\_id: String, device\_name: String },  
    Lost { fullname: String },  
}

\#\[tauri::command\]  
pub async fn start\_discovery\<R: Runtime\>(  
    state: State\<'\_, MdnsState\>,  
    on\_peer\_discovered: Channel\<PeerEvent\>,  
) \-\> Result\<(), String\> {  
    let service\_type \= "\_stratigraph.\_tcp.local.";  
    let receiver \= state.daemon.browse(service\_type).map\_err(|e| e.to\_string())?;

    tauri::async\_runtime::spawn(async move {  
        // Continuously listen for mDNS broadcast events without blocking  
        while let Ok(event) \= receiver.recv\_async().await {  
            match event {  
                mdns\_sd::ServiceEvent::ServiceResolved(info) \=\> {  
                    let peer \= PeerEvent::Found {  
                        ip: info.get\_addresses().iter().next().unwrap().to\_string(),  
                        port: info.get\_port(),  
                        room\_id: info.get\_property\_val\_str("room\_id").unwrap\_or("").to\_string(),  
                        device\_name: info.get\_property\_val\_str("device\_name").unwrap\_or("").to\_string(),  
                    };  
                    // Stream the data efficiently to the React UI  
                    let \_ \= on\_peer\_discovered.send(peer);  
                },  
                mdns\_sd::ServiceEvent::ServiceRemoved(\_, fullname) \=\> {  
                    let \_ \= on\_peer\_discovered.send(PeerEvent::Lost { fullname });  
                },  
                \_ \=\> {}  
            }  
        }  
    });  
      
    Ok(())  
}

The React frontend utilizes standard React hooks to consume this channel stream, maintaining a live list of nearby archaeological devices.  
**Structural Pseudocode for the React UI (src/hooks/useMdns.ts):**

TypeScript  
import { useEffect, useState } from 'react';  
import { invoke, Channel } from '@tauri-apps/api/core';

export interface Peer {  
    ip: string;  
    port: number;  
    roomId: string;  
    deviceName: string;  
}

export function useMdnsDiscovery(roomId: string) {  
    const \[peers, setPeers\] \= useState\<Map\<string, Peer\>\>(new Map());

    useEffect(() \=\> {  
        // Initialize the optimized Tauri IPC Channel receiver  
        const channel \= new Channel\<{ type: string; ip?: string; port?: number; roomId?: string; deviceName?: string; fullname?: string }\>();  
          
        channel.onmessage \= (event) \=\> {  
            if (event.type \=== 'Found' && event.roomId \=== roomId) {  
                setPeers((prev) \=\> {  
                    const next \= new Map(prev);  
                    next.set(event.ip\!, {  
                        ip: event.ip\!,  
                        port: event.port\!,  
                        roomId: event.roomId\!,  
                        deviceName: event.deviceName\!  
                    });  
                    return next;  
                });  
            } else if (event.type \=== 'Lost') {  
                // Remove the stale peer from the React state  
            }  
        };

        // Trigger the Rust background task  
        invoke('start\_discovery', { onPeerDiscovered: channel }).catch(console.error);  
    }, \[roomId\]);

    return Array.from(peers.values());  
}

### **Phase 4: OS Hardening and Risk Mitigation**

The final phase focuses entirely on security and reliability. The NSLocalNetworkUsageDescription and NSBonjourServices keys are permanently injected into the macOS tauri.conf.json. The Entitlements.plist is generated, securing the required network access. Finally, the custom WiX XML for Windows is authored to silently configure the Defender Firewall rules during the .msi installation process.

#### **Mitigating Stale Records and Network Partitions**

A critical risk involves the persistence of Stale mDNS Records. mDNS broadcasts can linger ominously on a network cache after a peer device unexpectedly disconnects, crashes, or powers down. If a device attempts to initiate a WebSocket connection to a stale IP/Port combination, the connection thread will hang indefinitely, consuming system resources. To mitigate this, aggressive connection timeouts (e.g., 2000ms) must be implemented on all outgoing WebSocket connection attempts. If the connection times out, the system must explicitly prune the ghost peer from the frontend's active device list and disregard the stale mDNS record. Furthermore, configuring the mdns-sd daemon to utilize a short Time To Live (TTL) ensures network records expire rapidly when a device leaves the network abruptly.7  
Network Partitions and Split-Brain Syndromes represent another severe risk in remote fieldwork locations. When utilizing large Ad-hoc Wi-Fi networks without a central router, physical distance can easily cause network partitioning. For example, two groups of archaeologists operating at opposite ends of a massive excavation site may lose radio connection, dividing the network mesh into two entirely isolated sub-meshes. Both groups may continue editing the exact same stratigraphic layer simultaneously. This risk is fundamentally and elegantly resolved by the mathematical properties of Yjs and CRDTs.1 Unlike legacy Operational Transformation (OT) systems, CRDTs are entirely immune to split-brain data corruption. Because every single operation is stamped with a unique client ID and a logical clock sequence, when the two partitioned meshes eventually walk back into Wi-Fi range and their respective mDNS daemons discover each other, the y-sync handshake will automatically exchange the radically divergent State Vectors. The Rust backend will seamlessly merge all offline operations concurrently, strictly guaranteeing eventual consistency without any data loss or user intervention required.24  
Finally, the High Volume Ephemeral Awareness State must be mitigated. Yjs utilizes an "Awareness" protocol to broadcast non-persistent UI states, such as active selection boxes and real-time cursor positions.2 Over a dense Full Mesh topology, rapid and erratic cursor movements from multiple users can flood the network with thousands of tiny binary updates, quickly saturating the limited bandwidth of a weak Ad-hoc Wi-Fi signal. The yrs-axum handler must be architecturally configured to aggressively rate-limit or debounce these awareness broadcasts, ensuring only substantial UI state changes or low-frequency presence heartbeats are actually transmitted across the LAN, preserving vital bandwidth for the core archaeological data synchronization.28

#### **Works cited**

1. Offline, Peer-to-Peer, Collaborative Editing using Yjs \- Show \- discuss.ProseMirror, accessed June 1, 2026, [https://discuss.prosemirror.net/t/offline-peer-to-peer-collaborative-editing-using-yjs/2488](https://discuss.prosemirror.net/t/offline-peer-to-peer-collaborative-editing-using-yjs/2488)  
2. yjs/yjs: Shared data types for building collaborative software \- GitHub, accessed June 1, 2026, [https://github.com/yjs/yjs](https://github.com/yjs/yjs)  
3. ZeroConf — Rust network library // Lib.rs, accessed June 1, 2026, [https://lib.rs/crates/zeroconf](https://lib.rs/crates/zeroconf)  
4. avahi-sys \- Lib.rs, accessed June 1, 2026, [https://lib.rs/crates/avahi-sys](https://lib.rs/crates/avahi-sys)  
5. libmdns \- Rust mDNS responder \- Lib.rs, accessed June 1, 2026, [https://lib.rs/crates/libmdns](https://lib.rs/crates/libmdns)  
6. tauri-plugin-network \- crates.io: Rust Package Registry, accessed June 1, 2026, [https://crates.io/crates/tauri-plugin-network/dependencies](https://crates.io/crates/tauri-plugin-network/dependencies)  
7. mdns\_sd \- Rust \- Docs.rs, accessed June 1, 2026, [https://docs.rs/mdns-sd/latest/mdns\_sd/](https://docs.rs/mdns-sd/latest/mdns_sd/)  
8. ServiceDaemon in mdns\_sd \- Rust \- Docs.rs, accessed June 1, 2026, [https://docs.rs/mdns-sd/latest/mdns\_sd/struct.ServiceDaemon.html](https://docs.rs/mdns-sd/latest/mdns_sd/struct.ServiceDaemon.html)  
9. UC Santa Cruz \- eScholarship.org, accessed June 1, 2026, [https://escholarship.org/content/qt74r4d4c5/qt74r4d4c5.pdf](https://escholarship.org/content/qt74r4d4c5/qt74r4d4c5.pdf)  
10. GitHub \- keepsimple1/mdns-sd: Rust library for mDNS based Service Discovery, accessed June 1, 2026, [https://github.com/keepsimple1/mdns-sd](https://github.com/keepsimple1/mdns-sd)  
11. simple-mdns — Rust network library // Lib.rs, accessed June 1, 2026, [https://lib.rs/crates/simple-mdns](https://lib.rs/crates/simple-mdns)  
12. mDNS server in Rust \- help \- The Rust Programming Language Forum, accessed June 1, 2026, [https://users.rust-lang.org/t/mdns-server-in-rust/127463](https://users.rust-lang.org/t/mdns-server-in-rust/127463)  
13. tauri-plugin-network \- Lib.rs, accessed June 1, 2026, [https://lib.rs/crates/tauri-plugin-network](https://lib.rs/crates/tauri-plugin-network)  
14. hrzlgnm/mdns-tui-browser \- GitHub, accessed June 1, 2026, [https://github.com/hrzlgnm/mdns-tui-browser](https://github.com/hrzlgnm/mdns-tui-browser)  
15. Calling the Frontend from Rust | Tauri, accessed June 1, 2026, [https://v2.tauri.app/develop/calling-frontend/](https://v2.tauri.app/develop/calling-frontend/)  
16. Inter-Process Communication \- Tauri, accessed June 1, 2026, [https://v2.tauri.app/concept/inter-process-communication/](https://v2.tauri.app/concept/inter-process-communication/)  
17. calling-rust-from-tauri-frontend | S... \- LobeHub, accessed June 1, 2026, [https://lobehub.com/bg/skills/neversight-skills\_feed-calling-rust-from-tauri-frontend](https://lobehub.com/bg/skills/neversight-skills_feed-calling-rust-from-tauri-frontend)  
18. Calling Rust from the Frontend \- Tauri, accessed June 1, 2026, [https://v2.tauri.app/develop/calling-rust/](https://v2.tauri.app/develop/calling-rust/)  
19. IPC in Tauri — Tauri Commands vs Custom IPC, What to Use When \- DEV Community, accessed June 1, 2026, [https://dev.to/hiyoyok/ipc-in-tauri-tauri-commands-vs-custom-ipc-what-to-use-when-2ab4](https://dev.to/hiyoyok/ipc-in-tauri-tauri-commands-vs-custom-ipc-what-to-use-when-2ab4)  
20. Built a multi-device terminal dashboard for Flutter in Rust with ratatui \+ tokio \+ the Dart VM Service \- Reddit, accessed June 1, 2026, [https://www.reddit.com/r/rust/comments/1to4fw2/built\_a\_multidevice\_terminal\_dashboard\_for/](https://www.reddit.com/r/rust/comments/1to4fw2/built_a_multidevice_terminal_dashboard_for/)  
21. Shipped a Tauri 2 \+ Svelte 5 desktop app with a full axum server ..., accessed June 1, 2026, [https://www.reddit.com/r/tauri/comments/1s4ah2f/shipped\_a\_tauri\_2\_svelte\_5\_desktop\_app\_with\_a/](https://www.reddit.com/r/tauri/comments/1s4ah2f/shipped_a_tauri_2_svelte_5_desktop_app_with_a/)  
22. Enhancing Flutter Desktop with Tauri: A Practical Rust-Based IPC Architecture, accessed June 1, 2026, [https://reddwarf03.medium.com/enhancing-flutter-desktop-with-tauri-a-practical-rust-based-ipc-architecture-e71a8d11b04d](https://reddwarf03.medium.com/enhancing-flutter-desktop-with-tauri-a-practical-rust-based-ipc-architecture-e71a8d11b04d)  
23. WebSocket — list of Rust libraries/crates // Lib.rs, accessed June 1, 2026, [https://lib.rs/web-programming/websocket](https://lib.rs/web-programming/websocket)  
24. yrs \- Rust \- Docs.rs, accessed June 1, 2026, [https://docs.rs/yrs](https://docs.rs/yrs)  
25. pycrdt-0-12-50 | Skills Marketplace · LobeHub, accessed June 1, 2026, [https://lobehub.com/en/skills/tangledgroup-tangled-skills-pycrdt-0-12-50](https://lobehub.com/en/skills/tangledgroup-tangled-skills-pycrdt-0-12-50)  
26. Yrs EndOfBuffer error \- Yjs Community, accessed June 1, 2026, [https://discuss.yjs.dev/t/yrs-endofbuffer-error/2709](https://discuss.yjs.dev/t/yrs-endofbuffer-error/2709)  
27. Y-CRDTs \- HackMD, accessed June 1, 2026, [https://hackmd.io/adn1PnTBTTCiLfL0S5Mtvg](https://hackmd.io/adn1PnTBTTCiLfL0S5Mtvg)  
28. y-crdt/yrs-warp: Yrs web socket data exchange protocol implementation for tokio warp server, accessed June 1, 2026, [https://github.com/y-crdt/yrs-warp](https://github.com/y-crdt/yrs-warp)  
29. yrs-tokio \- crates.io: Rust Package Registry, accessed June 1, 2026, [https://crates.io/crates/yrs-tokio](https://crates.io/crates/yrs-tokio)  
30. yrs-axum \- crates.io: Rust Package Registry, accessed June 1, 2026, [https://crates.io/crates/yrs-axum](https://crates.io/crates/yrs-axum)  
31. Support for y.js in Java \- Development \- XWiki Forum, accessed June 1, 2026, [https://forum.xwiki.org/t/support-for-y-js-in-java/16908](https://forum.xwiki.org/t/support-for-y-js-in-java/16908)  
32. Beyond Electron: Attacking Alternative Desktop Application Frameworks \- Bishop Fox, accessed June 1, 2026, [https://bishopfox.com/blog/beyond-electron-attacking-alternative-desktop-application-frameworks](https://bishopfox.com/blog/beyond-electron-attacking-alternative-desktop-application-frameworks)  
33. macOS Sandbox Debug & Bypass \- HackTricks, accessed June 1, 2026, [https://hacktricks.wiki/ko/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-sandbox/macos-sandbox-debug-and-bypass/index.html](https://hacktricks.wiki/ko/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-sandbox/macos-sandbox-debug-and-bypass/index.html)  
34. App Sandbox | Apple Developer Forums, accessed June 1, 2026, [https://developer.apple.com/forums/tags/app-sandbox](https://developer.apple.com/forums/tags/app-sandbox)  
35. TN3179: Understanding local network privacy | Apple Developer Documentation, accessed June 1, 2026, [https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)  
36. MacOS: How do I give my program permissions during development? \- Stack Overflow, accessed June 1, 2026, [https://stackoverflow.com/questions/78586575/macos-how-do-i-give-my-program-permissions-during-development](https://stackoverflow.com/questions/78586575/macos-how-do-i-give-my-program-permissions-during-development)  
37. Tauri macOS Production Build Failing: All Outgoing Network Requests Blocked (Updater, reqwest) · Issue \#13878 \- GitHub, accessed June 1, 2026, [https://github.com/tauri-apps/tauri/issues/13878](https://github.com/tauri-apps/tauri/issues/13878)  
38. Tauri macOS Production Build Failing: All Outgoing Network Requests Blocked (Updater, reqwest) \- Reddit, accessed June 1, 2026, [https://www.reddit.com/r/tauri/comments/1m76w9q/tauri\_macos\_production\_build\_failing\_all\_outgoing/](https://www.reddit.com/r/tauri/comments/1m76w9q/tauri_macos_production_build_failing_all_outgoing/)  
39. Network | Apple Developer Forums, accessed June 1, 2026, [https://developer.apple.com/forums/tags/network?page=2\&sortBy=oldest](https://developer.apple.com/forums/tags/network?page=2&sortBy=oldest)  
40. sym-bot/sym-swift: Add your iOS or macOS app to the mesh. Same protocol as SYM (Node.js) — agents discover each other via Bonjour and think together. · GitHub, accessed June 1, 2026, [https://github.com/sym-bot/sym-swift](https://github.com/sym-bot/sym-swift)  
41. Multipeer Connectivity | Apple Developer Documentation, accessed June 1, 2026, [https://developer.apple.com/documentation/multipeerconnectivity](https://developer.apple.com/documentation/multipeerconnectivity)  
42. IOS/OSX Messaging Using the Network Framework and Bonjour Service (no external server required\!). \- Borama Apps, accessed June 1, 2026, [https://boramaapps.medium.com/ios-osx-connections-with-network-framework-and-bonjour-service-7fa6130f5789](https://boramaapps.medium.com/ios-osx-connections-with-network-framework-and-bonjour-service-7fa6130f5789)  
43. Test Flight \- Local Network permission, NSBonjourServices error in TestFlight build, accessed June 1, 2026, [https://stackoverflow.com/questions/65633915/test-flight-local-network-permission-nsbonjourservices-error-in-testflight-bu](https://stackoverflow.com/questions/65633915/test-flight-local-network-permission-nsbonjourservices-error-in-testflight-bu)  
44. iOS local network permission prompt not appearing for \`MultipeerConnectivity\` despite \`NSBonjourServices\` in \`Info.plist\` \- Stack Overflow, accessed June 1, 2026, [https://stackoverflow.com/questions/79809131/ios-local-network-permission-prompt-not-appearing-for-multipeerconnectivity-de](https://stackoverflow.com/questions/79809131/ios-local-network-permission-prompt-not-appearing-for-multipeerconnectivity-de)  
45. NVIDIA Sync v0.64.24 on macOS: Local Network warning shown, but app does not appear in Local Network settings \- DGX Spark / GB10 \- NVIDIA Developer Forums, accessed June 1, 2026, [https://forums.developer.nvidia.com/t/nvidia-sync-v0-64-24-on-macos-local-network-warning-shown-but-app-does-not-appear-in-local-network-settings/371275](https://forums.developer.nvidia.com/t/nvidia-sync-v0-64-24-on-macos-local-network-warning-shown-but-app-does-not-appear-in-local-network-settings/371275)  
46. iOS Simulator: "Local Network" Permission Denied \- Auth Prompt Not Appearing on Xcode 16.4 / iOS 18 \- FlutterFlow Community, accessed June 1, 2026, [https://community.flutterflow.io/ask-the-community/post/ios-simulator-local-network-permission-denied---auth-prompt-not-bj4PDVzkVlsqoQ2](https://community.flutterflow.io/ask-the-community/post/ios-simulator-local-network-permission-denied---auth-prompt-not-bj4PDVzkVlsqoQ2)  
47. Windows Installer \- The Tauri Documentation WIP, accessed June 1, 2026, [https://jonaskruckenberg.github.io/tauri-docs-wip/building/windows-installer.html](https://jonaskruckenberg.github.io/tauri-docs-wip/building/windows-installer.html)  
48. Windows Installer \- Tauri, accessed June 1, 2026, [https://v2.tauri.app/distribute/windows-installer/](https://v2.tauri.app/distribute/windows-installer/)  
49. \[feat\] Allow usage of Wix extensions (FirewallException etc) · Issue \#4546 · tauri-apps/tauri, accessed June 1, 2026, [https://github.com/tauri-apps/tauri/issues/4546](https://github.com/tauri-apps/tauri/issues/4546)  
50. How to embed Python for sidecar · tauri-apps · Discussion \#2759 \- GitHub, accessed June 1, 2026, [https://github.com/orgs/tauri-apps/discussions/2759](https://github.com/orgs/tauri-apps/discussions/2759)  
51. Tabularis: The Tauri Database Tool Developers Crave \- Smart Converter, accessed June 1, 2026, [https://converter.brightcoding.dev/blog/tabularis-the-revolutionary-tauri-database-tool-developers-crave](https://converter.brightcoding.dev/blog/tabularis-the-revolutionary-tauri-database-tool-developers-crave)  
52. macOS Bypassing Firewalls \- HackTricks, accessed June 1, 2026, [https://hacktricks.wiki/en/macos-hardening/macos-security-and-privilege-escalation/macos-bypassing-firewalls.html](https://hacktricks.wiki/en/macos-hardening/macos-security-and-privilege-escalation/macos-bypassing-firewalls.html)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAAWCAYAAAAmaHdCAAAA8klEQVR4XmNgGAV0AUVA/B8JZ6FKM4ggycHwXBQVSGAhEH9lgCgKRZMDAScg3oUuiA6eAfE0Boghx9DkQKAaiCvRBZGBHhBfAWJ1BoSTQTYjg91AbIYmhgI2ArEvlO3AgDDIACrmBcTLoGysgBmIPwIxN5LYaQaIIQug/D4gToPLYgEOQHwATSySAWLITygf5FVlhDQmaADiGjQxFiB+wAAxSBGIb6HIogFeIH7DANGEDniA+D0DxKtBaHIowJ8BEqi4QCcQ/wZiQXQJGGAH4iMMkEDUBmJGVGkwkGKAqMEKQFGHnpSbUVQgQBm6wCigIQAAUuMzbDi1BLwAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGEAAAAWCAYAAADQIfLaAAACQUlEQVR4Xu2YT4hOURjGH/8pK1KyMETKBg2llJSSUlJSirJAlGQkygIjspASUmOajeRPShFL/4sdkuxsFJtBRhZEief93nvcc565U2MzMznnV0/fvc9z7r3fd86977nnAwqFQuG/Zz01W83C0HJTjcLg2En9jnQkjVv0IW3zLI1b2FMwWc2Ky0iPX5nGaI+yoNNJi0w4R32Ad8AeyYzpakQ8oZ6r2cB+1J28SDLjqhq58Zo6Bu+gN9TYNMYG2Q/YHGDHbNRAmAE/52N4+4tJ6mxTIyfaqHfUNOobvJM2JS2A87If6KR+UhM0ELZUn+vg5/8RZQH7HtlyBXWnz0ddMgJzqJfRfmA09ZW6oUED76PtHfDz26AHtkbb2TGK+oi0Q+wtJx6EXWieKGfB210QX1lIvYr2x1O91OHIuxZtZ8cS6oV4K+Cda5lxi1pTx3+x3Nod10DYR50R7xB8ICZRY6gvaZwXB6hTapKn8DJjtf4TvLOUVfBB2KuBcJtaK95U+LEd1HLqYRoPyFzU5XIwsqduRDMRfgfap2L13n6E1fyDkgXmwduc1CDC1gT31Kz4hfoayyTLhtXUXTUjwt20WIOKKfC8W4OIE2heABo2D9jxn+ElKTvsMX0Ef+uxidMmaMUWb1a37akYCHvreaBmhc0jb6lL1Mw0arEUPgjXNciBBehfO88mLZyjVJeaQg/1nRon/m70v0YT96nNahb+DZtPbKHXNIiFIWQ7fKVdGEZszrijZmF4sH9TmybgQmHk8QfSIYPy6dzuVAAAAABJRU5ErkJggg==>