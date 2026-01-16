const appRoot = document.getElementById("app-root")
const statusEl = document.getElementById("app-status")

const state = {
  route: "home",
  query: "",
  selectedResident: null,
  page: 1,
  selectedSize: null,
  deliveryNote: "",
  autoReturnTimer: null,
  inactivityTimer: null,
  cameraStream: null,
  scanAnimation: null,
  pickupFlow: "pickup",
  residents: null,
  residentsLoaded: false,
  residentsLoading: false,
  residentsError: null,
  availableSizes: null,
  sizesLoaded: false,
  sizesLoading: false,
  sizesError: null
}

const routes = {
  home: renderHome,
  delivery: renderDelivery,
  deliverySize: renderDeliverySize,
  deliveryNote: renderDeliveryNote,
  deliveryOpen: renderDeliveryOpen,
  deliverySuccess: renderDeliverySuccess,
  pickup: renderPickup,
  pickupQr: renderPickupQr,
  pickupCode: renderPickupCode,
  pickupOpen: renderPickupOpen,
  pickupSuccess: renderPickupSuccess,
  reservation: renderReservation,
  reservationQr: renderReservationQr,
  reservationCode: renderReservationCode,
  reservationSize: renderReservationSize,
  reservationOpen: renderReservationOpen,
  reservationSuccess: renderReservationSuccess
}

function setStatus(message) {
  if (!statusEl) return
  statusEl.textContent = message || ""
}

function navigate(route, payload) {
  stopCameraStream()
  state.route = route
  if (payload && payload.selectedResident) {
    state.selectedResident = payload.selectedResident
  }
  if (payload && payload.selectedSize) {
    state.selectedSize = payload.selectedSize
  }
  if (payload && typeof payload.deliveryNote === "string") {
    state.deliveryNote = payload.deliveryNote
  }
  if (payload && typeof payload.page === "number") {
    state.page = payload.page
  }
  if (state.autoReturnTimer) {
    clearTimeout(state.autoReturnTimer)
    state.autoReturnTimer = null
  }
  resetInactivityTimer()
  render()
}

function render() {
  appRoot.innerHTML = ""
  const renderer = routes[state.route]
  if (renderer) {
    renderer()
  }
}

function createButton(label, onClick, className) {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = label
  button.className = className || "btn"
  button.addEventListener("click", onClick)
  return button
}

function renderHeaderActions(container) {
  const actions = document.createElement("div")
  actions.className = "app__actions"
  const backButton = createButton("Home", () => navigate("home"), "btn btn--ghost")
  actions.appendChild(backButton)
  container.appendChild(actions)
}

function createStepHeader(title, step, total) {
  const header = document.createElement("div")
  header.className = "step-header"

  const homeButton = createButton("Home", () => navigate("home"), "btn btn--home")
  header.appendChild(homeButton)

  const textWrap = document.createElement("div")
  textWrap.className = "step-header__text"

  const titleEl = document.createElement("div")
  titleEl.className = "step-header__title"
  titleEl.textContent = title
  textWrap.appendChild(titleEl)

  if (total && total > 0) {
    const progress = document.createElement("div")
    progress.className = "step-header__progress"
    for (let i = 1; i <= total; i += 1) {
      const dot = document.createElement("span")
      dot.className = "step-header__dot"
      if (i <= step) {
        dot.classList.add("is-active")
      }
      progress.appendChild(dot)
    }
    textWrap.appendChild(progress)
  }

  header.appendChild(textWrap)
  return header
}

function renderHome() {
  setStatus("")
  const wrapper = document.createElement("div")
  wrapper.className = "grid grid--3 home-grid"

  wrapper.appendChild(
    createImageTile("Delivery", "assets/delivery.png", () => navigate("delivery"))
  )
  wrapper.appendChild(
    createImageTile("Pick-up", "assets/pickup.png", () => navigate("pickup"))
  )
  wrapper.appendChild(
    createImageTile("Reservation", "assets/reservation.png", () => navigate("reservation"))
  )

  appRoot.appendChild(wrapper)
}

function getApiConfig() {
  const config = window.PARCELBOX_CONFIG || {}
  const apiBaseUrl = config.apiBaseUrl || config.baseUrl
  const boxUuid = config.boxUuid
  if (!apiBaseUrl || !boxUuid) return null
  return { apiBaseUrl, boxUuid }
}

function normalizeResidentsFromApi(payload) {
  if (!Array.isArray(payload)) return []
  const residents = []
  payload.forEach((resident) => {
    const apartmentNumber = resident.apartment && resident.apartment.number
      ? resident.apartment.number
      : ""
    residents.push({
      id: resident.uuid,
      name: `${resident.firstName || ""} ${resident.lastName || ""}`.trim(),
      apartment: apartmentNumber,
      userUuid: resident.uuid,
      userSelected: `${resident.firstName || ""} ${resident.lastName || ""}`.trim()
    })
    if (Array.isArray(resident.familyMembers)) {
      resident.familyMembers.forEach((member) => {
        residents.push({
          id: member.uuid,
          name: `${member.firstName || ""} ${member.lastName || ""}`.trim(),
          apartment: apartmentNumber,
          userUuid: resident.uuid,
          userSelected: `${member.firstName || ""} ${member.lastName || ""}`.trim()
        })
      })
    }
  })
  return residents
}

function normalizeSizesFromApi(payload) {
  if (!Array.isArray(payload)) return []
  const order = ["small", "medium", "large", "extra_large", "extra_extra_large"]
  const allowed = new Set(payload.map((value) => String(value || "").toLowerCase()))
  return order.filter((size) => allowed.has(size))
}

async function submitDelivery() {
  const config = getApiConfig()
  if (!config) return true
  if (!state.selectedResident || !state.selectedSize) {
    setStatus("Missing delivery information.")
    return false
  }
  if (!state.selectedResident.userUuid) {
    setStatus("Unable to submit delivery for this resident.")
    return false
  }
  if (!state.selectedSize.key) {
    setStatus("Please select a valid size.")
    return false
  }

  const payload = {
    boxUuid: config.boxUuid,
    userUuid: state.selectedResident.userUuid,
    userSelected: state.selectedResident.userSelected || state.selectedResident.name,
    unitSize: state.selectedSize.key,
    message: state.deliveryNote || ""
  }

  try {
    const url = `${config.apiBaseUrl}/api/v1/apartment/deliveries`
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`)
    }
    return true
  } catch (error) {
    setStatus("Unable to submit delivery. Try again.")
    return false
  }
}

async function ensureResidentsLoaded() {
  if (state.residentsLoading || state.residentsLoaded) return
  const config = getApiConfig()
  if (!config) return
  state.residentsLoading = true
  state.residentsError = null
  try {
    const url = `${config.apiBaseUrl}/api/v1/apartment?boxUuid=${encodeURIComponent(config.boxUuid)}`
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`)
    }
    const payload = await response.json()
    state.residents = normalizeResidentsFromApi(payload)
    state.residentsLoaded = true
  } catch (error) {
    state.residentsError = error
    state.residentsLoaded = true
  } finally {
    state.residentsLoading = false
    if (state.route === "delivery") {
      render()
    }
  }
}

async function ensureSizesLoaded() {
  if (state.sizesLoading || state.sizesLoaded) return
  const config = getApiConfig()
  if (!config) return
  state.sizesLoading = true
  state.sizesError = null
  try {
    const url = `${config.apiBaseUrl}/api/v1/apartment/available-unit-sizes?boxUuid=${encodeURIComponent(config.boxUuid)}`
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`)
    }
    const payload = await response.json()
    state.availableSizes = normalizeSizesFromApi(payload)
    state.sizesLoaded = true
  } catch (error) {
    state.sizesError = error
    state.sizesLoaded = true
  } finally {
    state.sizesLoading = false
    if (state.route === "deliverySize" || state.route === "reservationSize") {
      render()
    }
  }
}

function createImageTile(label, imagePath, onClick) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "tile tile--image"
  button.addEventListener("click", onClick)

  const img = document.createElement("img")
  img.src = imagePath
  img.alt = label
  img.className = "tile__image"

  const text = document.createElement("div")
  text.className = "tile__label"
  text.textContent = label

  button.appendChild(img)
  button.appendChild(text)
  return button
}

function renderDelivery() {
  ensureResidentsLoaded()
  setStatus("Select resident")
  const section = document.createElement("section")
  section.className = "section"

  const header = createStepHeader("Select resident", 1, 3)

  const search = document.createElement("input")
  search.type = "search"
  search.placeholder = "Search name or apartment"
  search.value = state.query
  search.className = "search"
  search.addEventListener("input", (event) => {
    state.query = event.target.value
    state.page = 1
    render()
  })

  const list = document.createElement("div")
  list.className = "grid grid--3 list"

  const residentsSource = state.residents || window.PARCELBOX_DATA.residents || []
  const filteredResidents = residentsSource
    .filter((resident) => {
      const needle = state.query.trim().toLowerCase()
      if (!needle) return true
      return (
        resident.name.toLowerCase().includes(needle) ||
        resident.apartment.toLowerCase().includes(needle)
      )
    })

  const pageSize = 9
  const totalPages = Math.max(1, Math.ceil(filteredResidents.length / pageSize))
  const currentPage = Math.min(state.page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const residents = filteredResidents.slice(startIndex, startIndex + pageSize)

  residents.forEach((resident) => {
    const card = document.createElement("button")
    card.type = "button"
    card.className = "card"
    card.innerHTML = `
      <div class="card__info">
        <div class="card__name">${resident.name}</div>
        <div class="card__meta">Apartment</div>
      </div>
      <div class="card__apartment">${resident.apartment}</div>
    `
    card.addEventListener("click", () => {
      const selectedResident = {
        ...resident,
        userUuid: resident.userUuid || resident.id || null,
        userSelected: resident.userSelected || resident.name
      }
      navigate("deliverySize", { selectedResident })
    })
    list.appendChild(card)
  })

  if (residents.length === 0) {
    const empty = document.createElement("div")
    empty.className = "empty"
    if (state.residentsLoading) {
      empty.textContent = "Loading residents..."
    } else if (state.residentsError) {
      empty.textContent = "Unable to load residents."
      const retry = createButton("Retry", () => {
        state.residentsLoaded = false
        state.residentsError = null
        ensureResidentsLoaded()
      }, "btn")
      retry.style.marginTop = "12px"
      empty.appendChild(retry)
    } else {
      empty.textContent = "No residents found."
    }
    list.appendChild(empty)
  }

  const pagination = document.createElement("div")
  pagination.className = "pagination"

  const prevButton = createButton("", () => {
    if (currentPage > 1) {
      state.page = currentPage - 1
      render()
    }
  }, "pager")
  prevButton.disabled = currentPage <= 1
  prevButton.setAttribute("aria-label", "Previous page")

  const nextButton = createButton("", () => {
    if (currentPage < totalPages) {
      state.page = currentPage + 1
      render()
    }
  }, "pager")
  nextButton.disabled = currentPage >= totalPages
  nextButton.setAttribute("aria-label", "Next page")

  const pageLabel = document.createElement("div")
  pageLabel.className = "pagination__label"
  pageLabel.textContent = `Page ${currentPage} of ${totalPages}`

  pagination.appendChild(prevButton)
  pagination.appendChild(pageLabel)
  pagination.appendChild(nextButton)

  const searchWrap = document.createElement("div")
  searchWrap.className = "search-wrap"

  const clearButton = document.createElement("button")
  clearButton.type = "button"
  clearButton.className = "search-clear"
  clearButton.textContent = "×"
  clearButton.addEventListener("click", () => {
    state.query = ""
    state.page = 1
    search.value = ""
    render()
  })

  searchWrap.appendChild(search)
  searchWrap.appendChild(clearButton)

  section.appendChild(header)
  section.appendChild(searchWrap)
  section.appendChild(list)
  section.appendChild(pagination)
  appRoot.appendChild(section)
}

function renderDeliverySize() {
  if (!state.selectedResident) {
    navigate("delivery")
    return
  }

  ensureSizesLoaded()
  setStatus(`Package for ${state.selectedResident.name}`)

  const section = document.createElement("section")
  section.className = "section"

  const header = createStepHeader("Select package size", 2, 3)

  const grid = document.createElement("div")
  grid.className = "size-grid"

  const sizesMap = {
    small: { key: "small", label: "S", dims: "30 x 20 x 10 cm" },
    medium: { key: "medium", label: "M", dims: "40 x 30 x 20 cm" },
    large: { key: "large", label: "L", dims: "50 x 40 x 30 cm" },
    extra_large: { key: "extra_large", label: "XL", dims: "60 x 50 x 40 cm" },
    extra_extra_large: { key: "extra_extra_large", label: "XXL", dims: "74 x 45 x 42 cm" }
  }
  const sizeOrder = ["small", "medium", "large", "extra_large", "extra_extra_large"]
  const available = state.availableSizes && state.availableSizes.length > 0
    ? state.availableSizes
    : sizeOrder
  const sizes = available.map((key) => sizesMap[key]).filter(Boolean)

  sizes.forEach((size) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "tile tile--compact size-tile"
    button.innerHTML = `
      <div class="size-tile__label">${size.label}</div>
      <div class="size-tile__dims">${size.dims}</div>
    `
    button.addEventListener("click", () => {
      navigate("deliveryNote", { selectedSize: size, deliveryNote: "" })
    })
    grid.appendChild(button)
  })

  section.appendChild(header)
  if (state.sizesLoading) {
    const notice = document.createElement("div")
    notice.className = "empty"
    notice.textContent = "Loading available sizes..."
    section.appendChild(notice)
  } else if (state.sizesError) {
    const notice = document.createElement("div")
    notice.className = "empty"
    notice.textContent = "Unable to load available sizes."
    const retry = createButton("Retry", () => {
      state.sizesLoaded = false
      state.sizesError = null
      ensureSizesLoaded()
    }, "btn")
    retry.style.marginTop = "12px"
    notice.appendChild(retry)
    section.appendChild(notice)
  } else {
    section.appendChild(grid)
  }
  appRoot.appendChild(section)
}

function renderDeliveryNote() {
  if (!state.selectedResident || !state.selectedSize) {
    navigate("delivery")
    return
  }

  const section = document.createElement("section")
  section.className = "section"

  const header = createStepHeader("Add a delivery note", 3, 3)

  const form = document.createElement("form")
  form.className = "note-form"

  const textarea = document.createElement("textarea")
  textarea.className = "note-input"
  textarea.placeholder = "Optional message for the resident"
  textarea.value = state.deliveryNote
  textarea.rows = 4
  textarea.addEventListener("input", (event) => {
    state.deliveryNote = event.target.value
    resetInactivityTimer()
  })

  const actions = document.createElement("div")
  actions.className = "note-actions"

  const handleSubmit = async () => {
    setStatus("Submitting delivery...")
    const ok = await submitDelivery()
    if (ok) {
      navigate("deliveryOpen")
    }
  }

  const skip = createButton("Skip", () => {
    state.deliveryNote = ""
    handleSubmit()
  }, "btn btn--ghost")

  const submit = createButton("", () => {
    handleSubmit()
  }, "note-submit")
  submit.setAttribute("aria-label", "Submit note")

  actions.appendChild(skip)
  actions.appendChild(submit)

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    handleSubmit()
  })

  form.appendChild(textarea)
  form.appendChild(actions)

  section.appendChild(header)
  section.appendChild(form)
  appRoot.appendChild(section)
}

function renderDeliveryOpen() {
  if (!state.selectedResident || !state.selectedSize) {
    navigate("delivery")
    return
  }

  const section = document.createElement("section")
  section.className = "section status-screen"

  const homeButton = createButton("Home", () => navigate("home"), "btn btn--home btn--home--floating")
  section.appendChild(homeButton)

  const title = document.createElement("div")
  title.className = "status-screen__title"
  title.textContent = "Box 39"

  const image = document.createElement("img")
  image.src = "assets/open-box.png"
  image.alt = "Open box"
  image.className = "status-screen__image"

  section.appendChild(title)
  section.appendChild(image)
  appRoot.appendChild(section)

  state.autoReturnTimer = setTimeout(() => {
    navigate("deliverySuccess")
  }, 3000)
}

function renderDeliverySuccess() {
  if (!state.selectedResident || !state.selectedSize) {
    navigate("delivery")
    return
  }

  const section = document.createElement("section")
  section.className = "section status-screen"

  const homeButton = createButton("Home", () => navigate("home"), "btn btn--home btn--home--floating")
  section.appendChild(homeButton)

  const image = document.createElement("img")
  image.src = "assets/success.png"
  image.alt = "Success"
  image.className = "status-screen__image"

  const title = document.createElement("div")
  title.className = "status-screen__title"
  title.textContent = "Package delivered"

  const info = document.createElement("div")
  info.className = "status-screen__info"
  info.innerHTML = `
    <div>Resident: ${state.selectedResident.name}</div>
    <div>Apartment: ${state.selectedResident.apartment}</div>
    <div>Box: 39 (${state.selectedSize.label})</div>
  `

  section.appendChild(image)
  section.appendChild(title)
  section.appendChild(info)
  appRoot.appendChild(section)

  state.autoReturnTimer = setTimeout(() => {
    navigate("home")
  }, 4000)
}

function renderPickup() {
  setStatus("Choose pick-up method")
  const wrapper = document.createElement("section")
  wrapper.className = "section"

  const header = createStepHeader("Choose pick-up method", 1, 2)

  const grid = document.createElement("div")
  grid.className = "grid grid--2"
  grid.appendChild(
    createImageTileWithClass(
      "QR",
      "assets/qr.png",
      () => navigate("pickupQr"),
      "tile tile--image tile--primary"
    )
  )
  grid.appendChild(
    createImageTileWithClass(
      "Code",
      "assets/code.png",
      () => navigate("pickupCode"),
      "tile tile--image tile--primary"
    )
  )

  wrapper.appendChild(header)
  wrapper.appendChild(grid)
  appRoot.appendChild(wrapper)
}

function createImageTileWithClass(label, imagePath, onClick, className) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = className
  button.addEventListener("click", onClick)

  const img = document.createElement("img")
  img.src = imagePath
  img.alt = label
  img.className = "tile__image"

  const text = document.createElement("div")
  text.className = "tile__label"
  text.textContent = label

  button.appendChild(img)
  button.appendChild(text)
  return button
}

function renderPickupQr() {
  state.pickupFlow = "pickup"
  setStatus("Scan QR code")
  const section = document.createElement("section")
  section.className = "section"

  const header = createStepHeader("Scan the QR code", 2, 2)

  const camera = createCameraPanel()
  section.appendChild(header)
  section.appendChild(camera)
  const scanNotice = createScanNotice()
  section.appendChild(scanNotice)
  appRoot.appendChild(section)

  startQrScanner(camera.querySelector("video"), scanNotice, (data) => {
    if (isValidQr(data)) {
      navigate("pickupOpen")
      return true
    }
    updateScanNotice(scanNotice, "Invalid QR code. Try again.")
    return false
  })
}

function renderPickupCode() {
  state.pickupFlow = "pickup"
  setStatus("Enter access code")
  const section = document.createElement("section")
  section.className = "section"

  const header = createStepHeader("Enter access code", 2, 2)

  const form = document.createElement("form")
  form.className = "code-form"

  const input = document.createElement("input")
  input.type = "text"
  input.inputMode = "numeric"
  input.maxLength = 5
  input.placeholder = "5-digit code"
  input.className = "code-input"
  input.readOnly = true

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    if (input.value.trim().length !== 5) {
      setStatus("Please enter a 5-digit code.")
      return
    }
    navigate("pickupOpen")
  })

  const keypad = document.createElement("div")
  keypad.className = "keypad"

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
  keys.forEach((digit) => {
    const key = createButton(digit, () => {
      if (input.value.length < input.maxLength) {
        input.value += digit
        resetInactivityTimer()
      }
    }, "keypad__key")
    keypad.appendChild(key)
  })

  const backspace = createButton("", () => {
    input.value = input.value.slice(0, -1)
    resetInactivityTimer()
  }, "keypad__key keypad__key--icon keypad__key--muted")
  backspace.setAttribute("aria-label", "Backspace")

  const zero = createButton("0", () => {
    if (input.value.length < input.maxLength) {
      input.value += "0"
      resetInactivityTimer()
    }
  }, "keypad__key")

  const enter = createButton("", () => {
    form.requestSubmit()
  }, "keypad__key keypad__key--icon keypad__key--primary")
  enter.setAttribute("aria-label", "Submit")

  keypad.appendChild(backspace)
  keypad.appendChild(zero)
  keypad.appendChild(enter)

  form.appendChild(input)
  form.appendChild(keypad)

  section.appendChild(header)
  section.appendChild(form)
  appRoot.appendChild(section)
}

function renderReservation() {
  state.pickupFlow = "reservation"
  setStatus("Choose reservation method")
  const wrapper = document.createElement("section")
  wrapper.className = "section"

  const header = createStepHeader("Choose reservation method", 1, 3)

  const grid = document.createElement("div")
  grid.className = "grid grid--2"
  grid.appendChild(
    createImageTileWithClass(
      "QR",
      "assets/qr.png",
      () => navigate("reservationQr"),
      "tile tile--image tile--primary"
    )
  )
  grid.appendChild(
    createImageTileWithClass(
      "Code",
      "assets/code.png",
      () => navigate("reservationCode"),
      "tile tile--image tile--primary"
    )
  )

  wrapper.appendChild(header)
  wrapper.appendChild(grid)
  appRoot.appendChild(wrapper)
}

function renderReservationQr() {
  state.pickupFlow = "reservation"
  setStatus("Scan reservation")
  const section = document.createElement("section")
  section.className = "section"

  const header = createStepHeader("Scan the QR code", 2, 3)

  const camera = createCameraPanel()
  section.appendChild(header)
  section.appendChild(camera)
  const scanNotice = createScanNotice()
  section.appendChild(scanNotice)
  appRoot.appendChild(section)

  startQrScanner(camera.querySelector("video"), scanNotice, (data) => {
    if (isValidQr(data)) {
      navigate("reservationSize")
      return true
    }
    updateScanNotice(scanNotice, "Invalid QR code. Try again.")
    return false
  })
}

function renderReservationCode() {
  state.pickupFlow = "reservation"
  setStatus("Enter reservation code")
  const section = document.createElement("section")
  section.className = "section"

  const header = createStepHeader("Enter reservation code", 2, 3)

  const form = document.createElement("form")
  form.className = "code-form"

  const input = document.createElement("input")
  input.type = "text"
  input.inputMode = "numeric"
  input.maxLength = 5
  input.placeholder = "5-digit code"
  input.className = "code-input"
  input.readOnly = true

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    if (input.value.trim().length !== 5) {
      setStatus("Please enter a 5-digit code.")
      return
    }
    navigate("reservationSize")
  })

  const keypad = document.createElement("div")
  keypad.className = "keypad"

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
  keys.forEach((digit) => {
    const key = createButton(digit, () => {
      if (input.value.length < input.maxLength) {
        input.value += digit
        resetInactivityTimer()
      }
    }, "keypad__key")
    keypad.appendChild(key)
  })

  const backspace = createButton("", () => {
    input.value = input.value.slice(0, -1)
    resetInactivityTimer()
  }, "keypad__key keypad__key--icon keypad__key--muted")
  backspace.setAttribute("aria-label", "Backspace")

  const zero = createButton("0", () => {
    if (input.value.length < input.maxLength) {
      input.value += "0"
      resetInactivityTimer()
    }
  }, "keypad__key")

  const enter = createButton("", () => {
    form.requestSubmit()
  }, "keypad__key keypad__key--icon keypad__key--primary")
  enter.setAttribute("aria-label", "Submit")

  keypad.appendChild(backspace)
  keypad.appendChild(zero)
  keypad.appendChild(enter)

  form.appendChild(input)
  form.appendChild(keypad)

  section.appendChild(header)
  section.appendChild(form)
  appRoot.appendChild(section)
}

function renderReservationSize() {
  state.pickupFlow = "reservation"
  ensureSizesLoaded()
  setStatus("Select box size")
  const section = document.createElement("section")
  section.className = "section"

  const header = createStepHeader("Select box size", 3, 3)

  const grid = document.createElement("div")
  grid.className = "size-grid"

  const sizesMap = {
    small: { key: "small", label: "S", dims: "30 x 20 x 10 cm" },
    medium: { key: "medium", label: "M", dims: "40 x 30 x 20 cm" },
    large: { key: "large", label: "L", dims: "50 x 40 x 30 cm" },
    extra_large: { key: "extra_large", label: "XL", dims: "60 x 50 x 40 cm" },
    extra_extra_large: { key: "extra_extra_large", label: "XXL", dims: "74 x 45 x 42 cm" }
  }
  const sizeOrder = ["small", "medium", "large", "extra_large", "extra_extra_large"]
  const available = state.availableSizes && state.availableSizes.length > 0
    ? state.availableSizes
    : sizeOrder
  const sizes = available.map((key) => sizesMap[key]).filter(Boolean)

  sizes.forEach((size) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "tile tile--compact size-tile"
    button.innerHTML = `
      <div class="size-tile__label">${size.label}</div>
      <div class="size-tile__dims">${size.dims}</div>
    `
    button.addEventListener("click", () => {
      state.selectedSize = size
      navigate("reservationOpen")
    })
    grid.appendChild(button)
  })

  section.appendChild(header)
  if (state.sizesLoading) {
    const notice = document.createElement("div")
    notice.className = "empty"
    notice.textContent = "Loading available sizes..."
    section.appendChild(notice)
  } else if (state.sizesError) {
    const notice = document.createElement("div")
    notice.className = "empty"
    notice.textContent = "Unable to load available sizes."
    const retry = createButton("Retry", () => {
      state.sizesLoaded = false
      state.sizesError = null
      ensureSizesLoaded()
    }, "btn")
    retry.style.marginTop = "12px"
    notice.appendChild(retry)
    section.appendChild(notice)
  } else {
    section.appendChild(grid)
  }
  appRoot.appendChild(section)
}

function renderReservationOpen() {
  state.pickupFlow = "reservation"
  if (!state.selectedSize) {
    navigate("reservationSize")
    return
  }
  const section = document.createElement("section")
  section.className = "section status-screen"

  const homeButton = createButton("Home", () => navigate("home"), "btn btn--home btn--home--floating")
  section.appendChild(homeButton)

  const title = document.createElement("div")
  title.className = "status-screen__title"
  title.textContent = "Box 39"

  const image = document.createElement("img")
  image.src = "assets/open-box.png"
  image.alt = "Open box"
  image.className = "status-screen__image"

  section.appendChild(title)
  section.appendChild(image)
  appRoot.appendChild(section)

  state.autoReturnTimer = setTimeout(() => {
    navigate("reservationSuccess")
  }, 3000)
}

function renderReservationSuccess() {
  state.pickupFlow = "reservation"
  renderPickupSuccess()
}

function renderPickupOpen() {
  const section = document.createElement("section")
  section.className = "section status-screen"

  const homeButton = createButton("Home", () => navigate("home"), "btn btn--home btn--home--floating")
  section.appendChild(homeButton)

  const title = document.createElement("div")
  title.className = "status-screen__title"
  title.textContent = "Box 39"

  const image = document.createElement("img")
  image.src = "assets/open-box.png"
  image.alt = "Open box"
  image.className = "status-screen__image"

  section.appendChild(title)
  section.appendChild(image)
  appRoot.appendChild(section)

  state.autoReturnTimer = setTimeout(() => {
    navigate("pickupSuccess")
  }, 3000)
}

function renderPickupSuccess() {
  const section = document.createElement("section")
  section.className = "section status-screen"

  const homeButton = createButton("Home", () => navigate("home"), "btn btn--home btn--home--floating")
  section.appendChild(homeButton)

  const image = document.createElement("img")
  image.src = "assets/success.png"
  image.alt = "Success"
  image.className = "status-screen__image"

  const title = document.createElement("div")
  title.className = "status-screen__title"
  title.textContent = state.pickupFlow === "reservation"
    ? "Package successfully stored for pickup"
    : "Package pick up - successful"

  const info = document.createElement("div")
  info.className = "status-screen__info"
  info.innerHTML = `
    <div>Box: 39</div>
  `

  section.appendChild(image)
  section.appendChild(title)
  section.appendChild(info)
  appRoot.appendChild(section)

  state.autoReturnTimer = setTimeout(() => {
    navigate("home")
  }, 4000)
}

function createCameraPanel() {
  const panel = document.createElement("div")
  panel.className = "camera"

  const video = document.createElement("video")
  video.setAttribute("autoplay", "")
  video.setAttribute("playsinline", "")
  video.setAttribute("muted", "")

  const overlay = document.createElement("div")
  overlay.className = "camera__overlay"
  overlay.textContent = "Camera loading..."

  panel.appendChild(video)
  panel.appendChild(overlay)
  return panel
}

async function startCamera(videoEl) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Camera not supported on this device.")
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    state.cameraStream = stream
    videoEl.srcObject = stream
    await videoEl.play()
    const overlay = videoEl.parentElement.querySelector(".camera__overlay")
    if (overlay) overlay.textContent = ""
  } catch (error) {
    setStatus("Camera permission denied or unavailable.")
  }
}

function stopCameraStream() {
  if (state.scanAnimation) {
    cancelAnimationFrame(state.scanAnimation)
    state.scanAnimation = null
  }
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop())
    state.cameraStream = null
  }
}

async function startQrScanner(videoEl, noticeEl, onResult) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    updateScanNotice(noticeEl, "Camera not supported on this device.")
    updateScanDebug(noticeEl, "Debug: mediaDevices unavailable")
    return
  }
  if (!window.parcelbox || !window.parcelbox.decodeQr) {
    updateScanNotice(noticeEl, "QR scanning not available.")
    updateScanDebug(noticeEl, "Debug: decodeQr missing")
    return
  }

  try {
    updateScanNotice(noticeEl, "Starting camera...")
    updateScanDebug(noticeEl, "Debug: requesting camera")
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    state.cameraStream = stream
    videoEl.srcObject = stream
    await videoEl.play()
    const overlay = videoEl.parentElement.querySelector(".camera__overlay")
    if (overlay) overlay.textContent = ""
    updateScanNotice(noticeEl, "Scanning for QR code...")
    updateScanDebug(noticeEl, "Debug: camera started")

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    let lastStatus = 0
    let lastDebug = 0

    const decodeFrame = () => {
      const vw = videoEl.videoWidth
      const vh = videoEl.videoHeight
      if (!vw || !vh) return null

      const attempts = [
        { sx: 0, sy: 0, sw: vw, sh: vh, dw: vw, dh: vh, mirror: false },
        { sx: vw * 0.2, sy: vh * 0.2, sw: vw * 0.6, sh: vh * 0.6, dw: vw, dh: vh, mirror: false },
        { sx: vw * 0.3, sy: vh * 0.3, sw: vw * 0.4, sh: vh * 0.4, dw: vw, dh: vh, mirror: false },
        { sx: 0, sy: 0, sw: vw, sh: vh, dw: vw, dh: vh, mirror: true }
      ]

      for (const attempt of attempts) {
        canvas.width = Math.round(attempt.dw)
        canvas.height = Math.round(attempt.dh)
        ctx.save()
        if (attempt.mirror) {
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(
          videoEl,
          attempt.sx,
          attempt.sy,
          attempt.sw,
          attempt.sh,
          0,
          0,
          canvas.width,
          canvas.height
        )
        ctx.restore()
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = window.parcelbox.decodeQr(
          imageData.data,
          imageData.width,
          imageData.height,
          { inversionAttempts: "attemptBoth" }
        )
        if (code && code.data) {
          return code
        }
      }
      return null
    }

    const scan = () => {
      try {
        if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
          const code = decodeFrame()
          const nowDebug = Date.now()
          if (nowDebug - lastDebug > 500) {
            updateScanDebug(
              noticeEl,
              `Debug: ${canvas.width}x${canvas.height} (frames ok)`
            )
            lastDebug = nowDebug
          }
          if (code && code.data) {
            const shouldStop = onResult(code.data)
            if (shouldStop) {
              stopCameraStream()
              return
            }
            updateScanDebug(noticeEl, `Debug: decoded "${code.data}"`)
          }
          const now = Date.now()
          if (now - lastStatus > 1000) {
            updateScanNotice(noticeEl, "Scanning for QR code...")
            lastStatus = now
          }
        } else {
          const nowDebug = Date.now()
          if (nowDebug - lastDebug > 500) {
            updateScanDebug(noticeEl, "Debug: waiting for camera frames")
            lastDebug = nowDebug
          }
        }
      } catch (error) {
        updateScanNotice(noticeEl, "Scanning error. Retrying...")
        updateScanDebug(noticeEl, `Debug: ${error.message || error}`)
      }
      state.scanAnimation = requestAnimationFrame(scan)
    }

    state.scanAnimation = requestAnimationFrame(scan)
  } catch (error) {
    updateScanNotice(noticeEl, "Camera permission denied or unavailable.")
    updateScanDebug(noticeEl, `Debug: ${error.message || error}`)
  }
}

function isValidQr(data) {
  const codes = window.PARCELBOX_DATA.validQrCodes || []
  const value = String(data || "").trim()
  return codes.includes(value)
}

function createScanNotice() {
  const wrapper = document.createElement("div")
  wrapper.className = "scan-notice"

  const message = document.createElement("div")
  message.className = "scan-notice__message"
  message.textContent = "Align the QR code inside the frame."

  const debug = document.createElement("div")
  debug.className = "scan-notice__debug"
  debug.textContent = "Debug: waiting for frames..."

  wrapper.appendChild(message)
  wrapper.appendChild(debug)
  return wrapper
}

function updateScanNotice(el, message) {
  if (!el) return
  const messageEl = el.querySelector(".scan-notice__message")
  if (messageEl) {
    messageEl.textContent = message
  }
}

function updateScanDebug(el, message) {
  if (!el) return
  const debugEl = el.querySelector(".scan-notice__debug")
  if (debugEl) {
    debugEl.textContent = message
  }
}

function showConfirmation(section, message) {
  setStatus(message)
  const existing = section.querySelector(".notice")
  if (existing) {
    existing.remove()
  }
  const notice = document.createElement("div")
  notice.className = "notice"
  notice.textContent = `${message} Returning home...`
  section.appendChild(notice)
  state.autoReturnTimer = setTimeout(() => {
    navigate("home")
  }, 5000)
}

render()

function resetInactivityTimer() {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer)
    state.inactivityTimer = null
  }
  if (state.route === "home") {
    return
  }
  state.inactivityTimer = setTimeout(() => {
    navigate("home")
  }, 60000)
}

;["click", "keydown", "touchstart", "input"].forEach((eventName) => {
  document.addEventListener(eventName, () => {
    if (state.route !== "home") {
      resetInactivityTimer()
    }
  })
})
