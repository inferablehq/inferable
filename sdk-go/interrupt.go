package inferable

// VALID_INTERRUPT_TYPES defines the valid types of interrupts that can occur during workflow execution.
type VALID_INTERRUPT_TYPES string

const (
	// APPROVAL indicates an interrupt that requires user approval to continue.
	APPROVAL VALID_INTERRUPT_TYPES = "approval"
	// GENERAL indicates a general interrupt that can be used for various purposes.
	GENERAL VALID_INTERRUPT_TYPES = "general"
)

// Interrupt represents an interruption in the normal flow of a workflow execution.
// Interrupts can be used to pause execution for approval or to handle exceptional conditions.
type Interrupt struct {
	// Type specifies the kind of interrupt.
	Type VALID_INTERRUPT_TYPES `json:"type"`
	// Message provides additional context about the interrupt.
	Message string `json:"message,omitempty"`
}

// Error implements the error interface, allowing Interrupts to be used as errors.
// This enables interrupts to be returned from functions that return errors.
func (i *Interrupt) Error() string {
	if i.Message != "" {
		return i.Message
	}
	return string(i.Type) + " interrupt"
}

// NewInterrupt creates a new Interrupt with the specified type and message.
// This is a general constructor for creating interrupts.
func NewInterrupt(typ VALID_INTERRUPT_TYPES, message string) *Interrupt {
	return &Interrupt{
		Type:    typ,
		Message: message,
	}
}

// ApprovalInterrupt creates a new approval interrupt with the specified message.
// Approval interrupts are used when user approval is required to continue execution.
func ApprovalInterrupt(message string) *Interrupt {
	return NewInterrupt(APPROVAL, message)
}

// GeneralInterrupt creates a new general interrupt with the specified message.
// General interrupts can be used for various purposes that require interrupting workflow execution.
func GeneralInterrupt(message string) *Interrupt {
	return NewInterrupt(GENERAL, message)
}
