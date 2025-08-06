# Miro Board Structure - External Reference Portal

## Board Layout
Create 4 swim lanes:
1. **Supplier Flow**
2. **Customer Flow - Postcode**
3. **Customer Flow - Email**
4. **System/Backend**

---

## SUPPLIER FLOW ELEMENTS

### Start
🟢 **Supplier receives unique link**
→ Connect to →

### Process Box
📧 **Opens link in browser**
→ Connect to →

### Decision Diamond
🔶 **First time visit?**
- YES → Connect to → 📧 **Enter email address**
- NO → Connect to → 📧 **Check existing session**

### Process Sequence (New User)
📧 **Enter email address**
→ 📧 **System sends OTP**
→ 📧 **Enter OTP code**
→ ✅ **Session created**

### Process Sequence (Returning User)
📧 **Check existing session**
→ ✅ **Session validated**

### Main Interface
📋 **Submission Dashboard**
- View past submissions
- Add new references
→ Connect to →

### Decision Diamond
🔶 **Upload method?**
- MANUAL → 📝 **Manual entry form**
- CSV → 📁 **CSV upload interface**

### Manual Entry Path
📝 **Manual entry form**
- PO Number
- Delivery ID
- Reference Number
- Validation Number
→ Connect to →

### CSV Upload Path
📁 **CSV upload interface**
→ 📊 **Parse CSV file**
→ Connect to →

### Validation
🔍 **System validates PO/Delivery**
→ Connect to →

### Decision Diamond
🔶 **Valid PO/Delivery?**
- YES → ✅ **Submit to database**
- NO → ❌ **Show error message** → Loop back to entry

### End States
✅ **Success confirmation**
- Show summary
- Option to add more
🔄 **Return to dashboard**

---

## CUSTOMER FLOW - POSTCODE VERIFICATION

### Start
🟢 **Customer landing page**
→ Connect to →

### Input Sequence
📝 **Enter PO/Delivery number**
→ 📝 **Enter postcode**
→ Connect to →

### System Check
🔍 **System validates match**
→ Connect to →

### Decision Diamond
🔶 **Postcode matches?**
- YES → 📊 **Display reference numbers**
- NO → ❌ **Error: Invalid postcode** → Loop back

### Actions Menu
📊 **Reference number display**
→ Connect to →

### Decision Diamond
🔶 **Customer action?**
- COPY → 📋 **Copy to clipboard**
- DOWNLOAD → 💾 **Generate CSV**
- SHARE → 🔗 **Create shareable link**

### Share Path
🔗 **Create shareable link**
→ 🔒 **Optional: Add password**
→ ✅ **Link generated**

---

## CUSTOMER FLOW - EMAIL VERIFICATION

### Start
🟢 **Customer landing page**
→ Connect to →

### Input Sequence
📝 **Enter PO/Delivery number**
→ 📧 **Enter email address**
→ Connect to →

### Email Process
📤 **System sends verification email**
→ ⏳ **Customer checks email**
→ 🔗 **Click verification link**
→ Connect to →

### Display
📊 **Display reference numbers**
→ Same action menu as postcode flow

---

## SYSTEM/BACKEND LANE

### Database Operations
🗄️ **Check PO/Delivery exists**
🗄️ **Store reference numbers**
🗄️ **Log access attempts**
🗄️ **Generate access tokens**

### Security Checks
🛡️ **Rate limiting check**
🛡️ **Session validation**
🛡️ **OTP generation**
🛡️ **Token expiry check**

---

## MIRO SETUP INSTRUCTIONS

1. **Create Shapes**:
   - 🟢 Circles = Start points
   - 📧📝📋 Rectangles = Process steps
   - 🔶 Diamonds = Decision points
   - ❌✅ Rounded rectangles = End states
   - 🗄️🛡️ Database symbols = System operations

2. **Color Coding**:
   - Green = Start
   - Blue = User actions
   - Yellow = System processes
   - Red = Errors
   - Gray = Backend operations

3. **Connection Types**:
   - Solid arrows = Primary flow
   - Dashed arrows = Alternative paths
   - Dotted arrows = System interactions

4. **Sticky Notes for**:
   - Security considerations
   - Implementation notes
   - Phase markers (MVP, Phase 2, etc.)

5. **Additional Elements**:
   - Timer icons ⏱️ for time-limited elements
   - Lock icons 🔒 for security features
   - Email icons 📧 for communication points

---

## KEY DECISION POINTS TO HIGHLIGHT

Create separate sticky note clusters for:

### Security Decisions
- Supplier: Email OTP vs Magic Link
- Customer: Postcode vs Email vs Both
- Session duration: 30 days vs per-visit
- Rate limiting thresholds

### Feature Decisions
- CSV format specification
- Duplicate handling strategy
- Link expiration times
- Data retention policy

### UI/UX Decisions
- Mobile-first vs Desktop-first
- Single page vs Multi-step
- Error handling approach
- Success feedback style