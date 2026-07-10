# Auto Calling CRM - Master TODO

This is the full build checklist for the Auto Calling CRM project. Use this file as the working task board while building the product.

## 0. Project Setup

- [x] Confirm product name, logo text, and primary brand colors.
- [x] Confirm first version scope: simulated calling first, real telephony later.
- [x] Choose tech stack for MVP.
- [x] Create frontend project.
- [x] Create backend project.
- [x] Create database setup.
- [x] Create environment configuration files.
- [x] Create seed/demo data for testing.
- [x] Create basic README with setup steps.

## 1. User Roles and Authentication

- [x] Create Admin role.
- [ ] Create Manager role.
- [ ] Create Executive role.
- [x] Create login API.
- [ ] Create logout flow.
- [ ] Add password hashing.
- [ ] Add session/token authentication.
- [ ] Add role-based permissions.
- [x] Add default admin user.
- [x] Build login screen.
- [x] Build protected dashboard layout.

## 2. Employee Management

- [x] Create employee database model.
- [ ] Add employee create/edit/delete APIs.
- [x] Add employee list API.
- [ ] Add fields: name, phone, email, role, department, language, status.
- [x] Add availability status: online, offline, free, busy.
- [ ] Add employee working hours.
- [ ] Add manager assignment.
- [x] Build employee list page.
- [x] Build employee add/edit form.
- [x] Build employee status controls.

## 3. Customer CRM

- [x] Create customer database model.
- [ ] Add customer create/edit/delete APIs.
- [ ] Add customer list API with search and filters.
- [ ] Add fields: name, phone, city, state, language, product, notes, status.
- [ ] Add assigned employee field.
- [ ] Add customer tags.
- [x] Add opt-out status.
- [x] Add customer call history relation.
- [x] Build customer list page.
- [ ] Build customer profile page.
- [x] Build customer add/edit form.
- [ ] Add CSV/Excel upload.
- [ ] Add upload validation for duplicate and invalid numbers.

## 4. Campaign Management

- [ ] Create campaign database model.
- [ ] Add campaign create/edit/delete APIs.
- [ ] Add campaign list API.
- [ ] Add campaign status: draft, active, paused, completed.
- [ ] Add campaign customer selection.
- [ ] Add campaign schedule and calling time window.
- [ ] Add campaign retry settings.
- [ ] Add campaign department routing.
- [ ] Build campaign list page.
- [ ] Build campaign creation wizard.
- [ ] Build campaign detail page.
- [ ] Add campaign start, pause, resume, and stop actions.

## 5. Message Template and Voice Setup

- [ ] Create message template model.
- [ ] Add variable placeholders like `{{name}}`, `{{company}}`, `{{product}}`.
- [ ] Add template preview with sample customer data.
- [ ] Add validation for missing variables.
- [ ] Add recorded audio upload.
- [ ] Add text message field for future text-to-speech.
- [ ] Add language selection.
- [ ] Build message template UI.
- [ ] Build audio preview player.

## 6. Outbound Auto Calling Flow

- [ ] Create call queue model.
- [ ] Create call log model.
- [ ] Add customers to campaign call queue.
- [ ] Add simulated dialing engine for MVP.
- [ ] Add statuses: pending, ringing, connected, no answer, failed, transferred, callback, completed.
- [ ] Add call attempt count.
- [ ] Add retry scheduling.
- [ ] Add campaign progress calculation.
- [ ] Build outbound call monitor page.
- [ ] Build call queue table.
- [ ] Build call status timeline.
- [ ] Add manual test button to simulate call result.

## 7. IVR Flow

- [ ] Define IVR options.
- [ ] Add option: Press 1 to talk to executive.
- [ ] Add option: Press 2 for callback.
- [ ] Add option: Press 9 to opt out.
- [ ] Create IVR flow model.
- [ ] Add IVR response capture.
- [ ] Add simulated keypress testing.
- [ ] Build IVR configuration page.
- [ ] Connect IVR choice to routing logic.

## 8. Live Agent Transfer

- [ ] Create routing service.
- [ ] Check employee department.
- [ ] Check employee language.
- [ ] Check employee availability.
- [ ] Check employee current call status.
- [ ] Add round-robin routing.
- [ ] Add priority routing for important customers.
- [ ] Add fallback when no employee is free.
- [ ] Create transfer log.
- [ ] Build executive incoming transfer screen.
- [ ] Show customer details during transfer.
- [ ] Show campaign details during transfer.
- [ ] Add accept/reject transfer action.
- [ ] Mark executive busy during active call.
- [ ] Mark executive free after call ends.

## 9. Callback Queue

- [ ] Create callback model.
- [ ] Create callback automatically when no employee is free.
- [ ] Create callback when customer presses callback option.
- [ ] Add callback date/time.
- [ ] Add callback assigned employee.
- [ ] Add callback status: pending, completed, missed, cancelled.
- [ ] Build callback list page.
- [ ] Add callback reminders.
- [ ] Add callback completion notes.

## 10. Incoming Call Handling

- [ ] Create incoming call log model.
- [ ] Add company number configuration.
- [ ] Add incoming greeting message.
- [ ] Add incoming IVR menu.
- [ ] Route incoming call by department.
- [ ] Reuse employee availability logic.
- [ ] Transfer incoming call to free employee.
- [ ] Create callback if no employee is free.
- [ ] Build incoming call monitor page.
- [ ] Add simulated incoming call test.

## 11. Executive Console

- [ ] Build executive dashboard.
- [ ] Show assigned customers.
- [ ] Show active transferred call.
- [ ] Show customer profile during call.
- [ ] Add call notes field.
- [ ] Add call outcome form.
- [ ] Add callback schedule form.
- [ ] Add quick status switch: online, offline, free, busy.
- [ ] Add recent call history.

## 12. Call Recording

- [ ] Create recording model.
- [ ] Store recording URL/file path.
- [ ] Link recording to call log and customer.
- [ ] Add recording upload API for MVP.
- [ ] Add recording playback in customer profile.
- [ ] Add recording playback in call history.
- [ ] Add recording download permission.
- [ ] Add secure access checks.

## 13. Reports and Analytics

- [ ] Add dashboard counters.
- [ ] Add total calls report.
- [ ] Add connected calls report.
- [ ] Add failed calls report.
- [ ] Add transferred calls report.
- [ ] Add callback report.
- [ ] Add campaign performance report.
- [ ] Add executive performance report.
- [ ] Add date filters.
- [ ] Add campaign filters.
- [ ] Add export to CSV.

## 14. Admin Settings

- [ ] Add company profile settings.
- [ ] Add departments.
- [ ] Add languages.
- [ ] Add working hours.
- [ ] Add retry limits.
- [ ] Add opt-out settings.
- [ ] Add call outcome settings.
- [x] Add number/telephony configuration placeholder.
- [ ] Add user permission settings.

## 15. Telephony Integration - Later Production Phase

- [ ] Choose provider: Twilio, Exotel, Knowlarity, MyOperator, Asterisk/SIP, or GSM gateway.
- [x] Create provider abstraction service.
- [ ] Add outbound call API integration.
- [x] Add incoming webhook integration.
- [x] Add IVR keypress webhook handling.
- [ ] Add call transfer API.
- [x] Add call recording webhook.
- [x] Add call status webhook.
- [ ] Add provider error handling.
- [ ] Add real number configuration.
- [ ] Test live outbound calls.
- [ ] Test live incoming calls.
- [ ] Test live call transfer.

## 16. Security and Compliance

- [ ] Add input validation.
- [ ] Add API authorization checks.
- [ ] Add audit log for admin actions.
- [ ] Add customer opt-out enforcement.
- [ ] Add calling time restrictions.
- [ ] Add recording access restrictions.
- [ ] Add password reset flow.
- [ ] Add data backup plan.
- [ ] Add privacy policy text for client deployment.

## 17. UI Polish and Sales Demo

- [ ] Add clean navigation sidebar.
- [ ] Add responsive dashboard layout.
- [ ] Add empty states.
- [ ] Add loading states.
- [ ] Add error messages.
- [ ] Add sample company data.
- [ ] Add sample customer list.
- [ ] Add sample campaign.
- [ ] Add demo script inside README.
- [ ] Add screenshots for sales presentation.

## 18. Testing

- [ ] Test login and permissions.
- [ ] Test employee CRUD.
- [ ] Test customer CRUD.
- [ ] Test CSV/Excel upload.
- [ ] Test campaign creation.
- [ ] Test variable replacement.
- [ ] Test simulated outbound call flow.
- [ ] Test IVR keypress flow.
- [ ] Test live transfer routing.
- [ ] Test no-employee-free callback flow.
- [ ] Test incoming call simulation.
- [ ] Test recording upload/playback.
- [ ] Test reports and filters.
- [ ] Test mobile layout.

## 19. Deployment Preparation

- [ ] Create production environment variables.
- [ ] Create deployment README.
- [ ] Add database migration/seed instructions.
- [ ] Add backup instructions.
- [ ] Add server start scripts.
- [ ] Add build scripts.
- [ ] Add basic monitoring/logging.
- [ ] Prepare demo deployment.

## 20. First Sellable Version Checklist

- [ ] Admin can log in.
- [ ] Admin can add employees.
- [ ] Admin can upload customers.
- [ ] Admin can create campaign.
- [ ] Campaign can use variable message.
- [ ] System can simulate outbound call.
- [ ] Customer can choose IVR option.
- [ ] System can route to free executive.
- [ ] System creates callback when no employee is free.
- [ ] Incoming call simulation works.
- [ ] Call recording is visible.
- [ ] Reports dashboard works.
- [ ] Demo data is ready.
- [ ] Sales proposal PDF is ready.
- [ ] 30-day roadmap PDF is ready.
